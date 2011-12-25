/*
This work is licensed under a Creative Commons
Attribution-NonCommercial-ShareAlike 3.0 Unported License.

This file was written by Corran Webster.

This javascript file is derived from, and is a port of, TinyHack
(http://boingboing.net/rob/tinyhack/) by Rob Beschizza.
*/

// Constants
var view_radius = 4;
var view_scale = 24;

// XXX probably should use some cross-browser HTML5 audio library
if (navigator.appVersion.indexOf("Chrome") != -1) {
    // Safari barfs if there are multiple channels playing the same source
    // but doesn't have the slow loading problem of Chrome
    var channels_per_sound = 4;
}
else {
    // allow multiple sounds to play at the same time
    var channels_per_sound = 1;
}

// Utilities

function hex(i) {
    var h = i.toString(16);
    if (h.length == 1) {
        h = "0"+h;
    }
    return h
}

function clip(x, a, b) {
    // clip x so that a <= x <= b
    return Math.min(Math.max(x,a),b);
}

function blocked_by(x1, y1, x2, y2) {
    // does the square at (x1, y1) block the square at (x2, y2)?
    
    // Are they in the same quadrant?
    if ((x1 != 0 && (x2/x1) < 0) || (y1 != 0 && (y2/y1) < 0))
        return false;
    // is x1, y1 closer to 0 than x2, y2?
    if (Math.abs(x1) > Math.abs(x2) || Math.abs(y1) > Math.abs(y2))
        return false;
    
    // are they the same square?
    if (x1 == x2 && y1 == y2)
        return false;
    
    // is the distance from x1, y1 to the line joining 0, 0 and x2, y2
    // less than sqrt(0.5)?
    return Math.abs(x1*y2 - x2*y1)/Math.sqrt(x2*x2 + y2*y2) < 0.5; //Math.sqrt(0.5);
}

function load_sound(src) {
    // preload 4 channels for each sound, so we can overlap
    var sound = {channels: [], current: 0};
    for (var i=0; i < channels_per_sound; i++) {
        sound.channels[i] = document.createElement('audio');
        sound.channels[i].src = src;
        sound.channels[i].load();
    }
    return sound
}

function play_sound(sound) {
    sound.channels[sound.current].play();
    sound.current = (sound.current + 1) % channels_per_sound;
}

function load_sprites(src, palette) {
    var sprite_size = (2*view_radius+1)
    var num_sprites = src.length/sprite_size/sprite_size;
    sprites = new Array();
    for (var s=0; s < num_sprites; s++) {
        sprites[s] = new Array();        
        for (var j=0; j < sprite_size; j++) {
            sprites[s][j] = new Array();
            var row_idx = (s + j*num_sprites)*sprite_size;
            for (var i=0; i < sprite_size; i++) {
                pixel_idx = (row_idx+i);
                sprites[s][j][i] = palette[src[pixel_idx]]
            }
        }
    }
    return sprites;
}


// Location prototype
//
// A location represents the logical contents of square/pixel on a map.
// These are featherweight objects used repeatedly in a given map.
// The on-screen representation will vary depending on the Dungeon's legend.

function Location(color, faded, passable, transparent) {
    if (!color) {
        color = "#000000";
    }
    if (!faded) {
        faded = "#000000";
    }
    if (!passable) {
        passable = false;
    }
    if (!transparent) {
        transparent = false;
    }

    this.color = color;
    this.faded = faded;
    this._passable = passable;
    this._transparent = transparent;
}

Location.prototype.passable = function(game, who) {
    // whether the location is passable, given the current game state
    // this doesn't take into account monsters or other obstructions
    return this._passable;
}

Location.prototype.transparent = function(game, who) {
    // whether the location can be seen through, given the current game state
    // this doesn't take into account monsters or other obstructions
    // XXX not currently used
    return this._transparent;
}

Location.prototype.look = function(game, who) {
    // if the location is impassable, instead look() into the square
    // location gets to override behaviour
    return false;
}

// A location which can be traversed if the player has an item
function PassableWithItemLocation(color, faded, item_name, transparent) {
    if (!color) {
        color = "#000000";
    }
    if (!faded) {
        faded = "#000000";
    }
    if (!transparent) {
        transparent = false;
    }

    this.color = color;
    this.faded = faded;
    this._transparent = transparent;
    this._item_name = item_name;
}
PassableWithItemLocation.prototype = new Location();

PassableWithItemLocation.prototype.passable = function(game, who) {
    // whether the location is passable, given the current game state
    // this doesn't take into account monsters or other obstructions
    for (idx in who.things) {
        var thing = who.things[idx];
        if (thing.name == this._item_name) {
            return true;
        }
    }
    return false;
}

var drinking_water = new Location("#5672ff", "#5672ff", false, true);
drinking_water.look = function(game, tx, ty) {
    if (game.player.hp < game.player.max_hp) {
        game.player.hp = Math.min(game.player.hp+10, game.player.max_hp);
        play_sound(sound_drink);
        game.player.dungeon.setLocation(tx, ty, '\x30');
    }    
}

// Location instances

var default_legend = {
    '\x00': new Location("#000000", "#000000", false, false), // wall (black)
    '\x01': new Location("#ffffff", "#ffffff", false, false), // mountain/door (white)
    '\x02': new Location("#915140", "#915140", false, true), //
    '\x03': new Location("#5d5d5d", "#5d5d5d", false, false), // wall (grey)
    '\x04': new Location("#008800", "#008800", false, true), // deep forest (dark green)
    '\x05': new Location("#d1a296", "#d1a296", false, true),
    
    '\x10': new Location("#003c80", "#003c80", false, true), // deep water (dark blue)
    
    '\x20': new PassableWithItemLocation("#0047ca", "#0047ca", "boat", true),
    
    '\x30': new Location("#7f7f7f", "#7f7f7f", true, true), // corridor (grey)
    '\x31': new Location("#bcbcbc", "#bcbcbc", true, true), // corridor (light grey)
    '\x32': new Location("#00aa00", "#00aa00", true, true), // grass (light green)
    '\x33': new Location("#9cde8d", "#9cde8d", true, true), 
    '\x34': new Location("#ffff00", "#ffff00", true, true),
    
    '\x40': new Location("#ff0000", "#ff0000", true, true), // teleporter
    '\x41': drinking_water,
}

var sound_enter_dungeon = load_sound("sounds/enterdungeon.mp3");
var sound_open_door = load_sound("sounds/dooropen.mp3");
var sound_drink = load_sound("sounds/drink.mp3");
var sound_magic = load_sound("sounds/magic.mp3");
var sound_gold = load_sound("sounds/gold.mp3");
var sound_powerup = load_sound("sounds/powerup.mp3");
var sound_level_up = load_sound("sounds/levelup.mp3");
var sound_monster_hit = load_sound("sounds/monsterhit.mp3");
var sound_player_hit = load_sound("sounds/playerhit.mp3");
var sound_start = load_sound("sounds/music_start.mp3");
var sound_dead = load_sound("sounds/dead.mp3");
var sound_win = load_sound("sounds/music_death.mp3");

// Things

// Abstract base type for things which are not terrain
function Thing(name, color, x, y) {
    this.name = name;
    this.x = x;
    this.y = y;
    
    this.color = color;

    this.block = false;
}

Thing.prototype.draw = function(gc, x, y) {
    // draw at the indicated location in the view
    // will not be called unless already cleared as OK
    gc.fillStyle = this.color;
    gc.fillRect(x*view_scale, y*view_scale, view_scale, view_scale);
}

Thing.prototype.move = function(game) {
    // if the Thing is self-mobile, update its location
    // can be used for other turn-based actions
    return false;
}

Thing.prototype.blocks = function(game) {
    // return true if the Thing blocks movement
    return this.block;
}

Thing.prototype.special = function(game) {
    // special interaction if player (tries to) enter same location as Thing
    return false;
}

Thing.prototype.magic = function(game) {
    // the Thing was in range of magic, update as appropriate
    return false;
}

Thing.prototype.remove = function(game) {
    // remove thing from dungeon
    var idx = game.player.dungeon.things.indexOf(this);
    if (idx != -1) {
        game.player.dungeon.things.splice(idx, 1);
    }
}

// Pub - restores health
var pub = new Thing("pub", "#000000");
pub.block = true;
pub.special = function(game) {
    if (game.player.hp < game.player.max_hp) {
        game.player.hp = game.player.max_hp;
        play_sound(sound_drink);
        game.show_sprite(5);
    }
}

// Church - gives magic
var church = new Thing("church", "#000000");
church.block = true;
church.special = function(game) {
    if (game.player.magic == 0) {
        game.player.magic = 1;
        play_sound(sound_magic);
        game.show_sprite(6);
    }
}


// Winning square - entering this triggers end of game with "win" condition
var win = new Thing('win');
win.draw = function(gc, x, y) {
    return false;
}
win.special = function(game) {
    game.gameOver("win");
}

// Gate - can only be entered if the player has a key item and enough cash
function Gate(name, x, y, key, gold) {
    this.name = name
    this.x = x;
    this.y = y;
    this.key = key;
    this.gold = gold;
}
Gate.prototype = new Thing();
Gate.prototype.draw = function(gc, x, y) {
    return false;
}
Gate.prototype.blocks = function(game) {
    var player = game.player;
    return !(player.hasThing(this.key) && (player.cash >= this.gold))
}
var gate = new Gate('gate');

// Teleporter - move the player to another place
function Teleporter(x, y, target_dungeon, tx, ty) {
    this.x = x;
    this.y = y;
    this.target_dungeon = target_dungeon;
    this.tx = tx;
    this.ty = ty;
}
Teleporter.prototype = new Thing();
Teleporter.prototype.name = "teleporter";
Teleporter.prototype.color = "#ff0000";

Teleporter.prototype.draw = function(gc, x, y) {
    return false;
}

Teleporter.prototype.special = function(game) {
    // move the player to the teleporter's target
    game.player.dungeon = game.dungeons[this.target_dungeon];
    game.player.x = this.tx;
    game.player.y = this.ty;
    play_sound(sound_enter_dungeon);
}

// PressurePad - change the terrain (eg. open a door) elsewhere
function PressurePad(x, y, target_dungeon, tx, ty, open) {
    this.x = x;
    this.y = y;
    this.target_dungeon = target_dungeon;
    this.tx = tx;
    this.ty = ty;
    this.open = open;
}
PressurePad.prototype = new Thing();
PressurePad.prototype.name = "pressure pad";
PressurePad.prototype.color = "#bcbcbc";

PressurePad.prototype.draw = function(gc, x, y) {
    return false;
}

PressurePad.prototype.special = function(game) {
    // open the target door
    var target_dungeon = game.dungeons[this.target_dungeon]
    target_dungeon.setLocation(this.tx, this.ty, this.open);
    play_sound(sound_open_door);
}

// Gold - if player enters square, increment cash & remove this from game
function Gold(x, y) {
    this.name = "gold"
    this.color = "#ffff00"
    this.x = x;
    this.y = y;
}
Gold.prototype = new Thing();

Gold.prototype.special = function(game) {
    game.player.cash++;
    this.remove(game);
    play_sound(sound_gold);
    //game.show_sprite(7);
    return true;
}

// PowerUp - base type for the different powerups
function PowerUp(name, sprite, x, y) {
    this.name = name;
    this.x = x;
    this.y = y;
    this.color = "#00fcff";
    this.sprite = sprite;

    this.block = false;
}
PowerUp.prototype = new Thing();

PowerUp.prototype.special = function(game) {
    // if player enters square, add to inventory, remove from game, show sprite
    game.player.things.push(this);
    this.remove(game);
    play_sound(sound_powerup);
    game.show_sprite(this.sprite);
    return true;
}

// PowerUp instances
var boat = new PowerUp('boat', 0)
var sword = new PowerUp('sword', 1)
var shield = new PowerUp('shield', 2)
var key = new PowerUp('key', 8)

// Monster - mobile monsters that attack players
function Monster(level, x, y) {
    this.name = 'monster';
    this.x = x;
    this.y = y;
    this.level = level;
    
    this.block = true;
    
    this.colors = [
        "#660000",
        "#660000",
        "#660000",
        "#AA0000",
        "#AA0000",
        "#CC0000",
        "#FF0000",
        "#FF0066",
        "#FF00FC",
        "#000000",
    ]
    this.color = this.getColor();
}
Monster.prototype = new Thing();

Monster.prototype.getColor = function() {
    // look up color based on level of monster
    if (this.level < 10) {
        return this.colors[this.level];
    }
    return "#000000";
}

Monster.prototype.move = function(game) {
    // move the monster
    var x = this.x;
    var y = this.y;
    var tx = game.player.x;
    var ty = game.player.y;
    
    // attack if adjacent
    if (((y == ty) && (Math.abs(x-tx) == 1)) ||
            ((x == tx) && (Math.abs(y-ty) == 1))) {
        this.attack(game);
        return;
    }

    // otherwise only move if close to player
    if ((x-tx >= -view_radius) && (x-tx <= view_radius) && 
            (y-ty >= -view_radius) && (y-ty <= view_radius)) {
        if (x < tx) {
            if (game.passable(x+1, y, this)) {
                this.x++;
                return;
            }
        }
        if (x > tx) {
            if (game.passable(x-1, y, this)) {
                this.x--;
                return;
            }
        }
        if (y < ty) {
            if (game.passable(x, y+1, this)) {
                this.y++;
                return;
            }
        }
        if (y > ty) {
            if (game.passable(x, y-1, this)) {
                this.y--;
                return;
            }
        }
    }
}

Monster.prototype.attack = function(game) {
    // attack the player - do random damage, halved by shield
    var damage = (Math.random(3)+5)*this.level;
    play_sound(sound_monster_hit);
    game.hit_player(damage);
}

Monster.prototype.special = function(game) {
    // player is adjacent and moved towards monster... attack!
    if (game.player.hasThing("sword")) {
        var damage = 2;
    }
    else {
        var damage = 1;
    }
    this.level -= damage;
    this.color = this.getColor();
    play_sound(sound_player_hit);
    
    if (this.level < 1) {
        // monster dead
        this.remove(game);
        game.player.experience();
    }
}

Monster.prototype.magic = function(game) {
    // monster zapped by magic, halve level
    this.level = Math.ceil(this.level/2);
    this.color = this.getColor();
    play_sound(sound_player_hit);
}

// Dungeon prototype
function Dungeon(name, map_data, width, legend, things) {
    // the name of the dungeon
    this.name = name;
    
    // an image containing the map data
    this.map_data = map_data;
    
    // the legend that maps colours to location types
    this.legend = legend;
    
    this.things = things;
    
    // secondary attributes
    this.width = width;
    this.height = map_data.length/width;
    this.default_color = "#dfdfdf";
}

Dungeon.prototype.setLocation = function(x, y, location) {
    this.locations[y][x] = this.legend[location];
}

Dungeon.prototype.loadMap = function() {
    this.locations = new Array();
    this.seen = new Array();
    for (var y=0; y < this.height; y++) {
        this.locations[y] = new Array();
        this.seen[y] = new Array();
        var row_idx = y*this.width;
        for (var x=0; x < this.width; x++) {
            var idx = row_idx+x;
            this.locations[y][x] = this.legend[this.map_data.charAt(idx)];
            this.seen[y][x] = false;
        }
    }
}

Dungeon.prototype.drawMap = function(game, gc, x,y) {
    for (var i=-view_radius; i <= view_radius; i++) {
        for (var j=-view_radius; j <= view_radius; j++) {
            if ((x+i >= 0) && (x+i < this.width) && (y+j >= 0) && (y+j < this.height)) {
                if (game.isVisible(game.player, x+i, y+j)) {
                    gc.fillStyle = this.locations[y+j][x+i].color;
                    this.seen[y+j][x+i] = true;
                }
                else if (this.seen[y+j][x+i]) {
                    gc.fillStyle = this.locations[y+j][x+i].faded;
                }
                else {
                    gc.fillStyle = this.default_color;
                }
            }
            else {
                gc.fillStyle = this.default_color;
            }
            gc.fillRect((i+view_radius)*view_scale, (j+view_radius)*view_scale, view_scale, view_scale);
        }
    }
    
    for (idx in this.things) {
        var thing = this.things[idx];
        var i = thing.x - x;
        var j = thing.y - y;
        if ((i >= -view_radius) && (i <= view_radius) &&
                (j >= -view_radius) && (j <= view_radius) &&
                game.isVisible(game.player, thing.x, thing.y)) {
            thing.draw(gc, i+view_radius, j+view_radius);
        }
    }
}


// player object

function Player(dungeon, x, y) {
    this.dungeon = dungeon;
    this.x = x;
    this.y = y;
    
    this.max_hp = 100;
    this.hp = 100;
    
    this.exp = 0;
    this.level = 0;
    
    this.cash = 0;
    this.things = [];
    this.magic = 0;
    
    this.color = "#ffffff";
}

Player.prototype.draw = function(gc, x, y) {    
    // draw the player
    gc.fillStyle = this.color;
    gc.fillRect((view_radius+this.x-x)*view_scale, (view_radius+this.y-y)*view_scale, view_scale, view_scale);

    // draw the hp indicator
    gc.fillStyle = this.health_color();
    gc.fillRect(0, 0, view_scale, view_scale);

    // draw the magic indicator
    if (this.magic > 0) {
        gc.fillStyle = this.magic_color();
        gc.fillRect(2*view_radius*view_scale, 0, view_scale, view_scale);
    }
}

Player.prototype.health_color = function() {
    var health = this.hp/this.max_hp;
    if (health > .80) { return "#00FF00";}
    if (health > .70) { return "#66FF00";}
    if (health > .60) { return "#AAFF00";}
    if (health > .50) { return "#DDFF00";}
    if (health > .40) { return "#FFFF00";}
    if (health > .30) { return "#ffdd00";}
    if (health > .20) { return "#ffaa00";}
    if (health > .10) { return "#ff6600";}
    return "#FF0000";
}

Player.prototype.magic_color = function() {
    var r = hex(Math.round(Math.random() * 0xff));
    var g = hex(Math.round(Math.random() * 0xff));
    var b = hex(Math.round(Math.random() * 0xff));
    return '#'+r+g+b;
}

Player.prototype.hasThing = function(name) {
    for (idx in this.things) {
        if (this.things[idx].name == name) {
            return true;
        }
    }
    return false;
}

Player.prototype.experience = function() {
    this.exp++;
    var bumps = [4, 8, 16, 32, 48];
    if (bumps.indexOf(this.exp) != -1) {
        this.level++;
        this.hp += 10;
        this.max_hp += 10;
        play_sound(sound_level_up);
    }
}

// game object

function Game(dungeons, player) {
    this.dungeons = dungeons;
    this.player = player;
    
    this.sprite = -1;
    
    game = this;
    document.onkeydown = function(event) { game.keyDown(event); };
}

Game.prototype.start = function() {
    game.show_sprite(4);
    game.drawMap();   
}

Game.prototype.doTimer = function() {
    this.drawMap();
    this.timeout = setTimeout("game.doTimer()", 250);
}

Game.prototype.move = function(dx, dy) {
    var tx = this.player.x + dx;
    var ty = this.player.y + dy;
    // XXX validate, etc
    
    // if we can enter the square, do so
    if (this.passable(tx, ty, this.player)) {
        this.player.x = tx;
        this.player.y = ty;
    }
    else {
        this.look(tx, ty);
    }
}

Game.prototype.magic = function() {
    if (this.player.magic <= 0) {
        return;
    }
    play_sound(sound_magic);
    this.player.magic--;

    var x = this.player.x;
    var y = this.player.y;

    for (idx in this.player.dungeon.things) {
        var thing = this.player.dungeon.things[idx];
        if ((thing.x - x >= -view_radius) && (thing.x - x <= view_radius) &&
                (thing.y - y >= -view_radius) && (thing.y - y <= view_radius)) {
            thing.magic(game);
        }
    }
}

Game.prototype.hit_player = function(damage) {
    if (this.player.hasThing("shield")) {
        // shield halves damage
        damage = Math.ceil(damage/2);
    }
    this.player.hp -= damage;
    if (this.player.hp <= 0) {
        this.gameOver("death");
    }
}

Game.prototype.passable = function(tx, ty, who) {
    var dungeon = this.player.dungeon;
    
    for (idx in this.player.dungeon.things) {
        var thing = this.player.dungeon.things[idx];
        if ((thing.x == tx) && (thing.y == ty) && thing.blocks(this)) {
            return false;
        }
    }
    
    return dungeon.locations[ty][tx].passable(this, who);
}

Game.prototype.isVisible = function(who, x2, y2) {
    // can who see square x2, y2?
    var x1 = who.x;
    var y1 = who.y;
    
    var x_dir = (x1 >= x2) ? -1 : 1;
    var y_dir = (y1 >= y2) ? -1 : 1;
    
    // is something blocking the view from (x, y) to (x+i, y+j)?
    for (var i=0; i <= Math.abs(x2-x1); i++) {
        for (var j=0; j <= Math.abs(y2-y1); j++) {
            if (blocked_by(i, j, Math.abs(x2-x1), Math.abs(y2-y1))) {
                var loc = this.player.dungeon.locations[y1+y_dir*j][x1+x_dir*i];
                if (!loc.transparent(this, who))
                    return false;
            }
        }
    }
    return true;
}

Game.prototype.look = function(tx, ty) {
    var dungeon = this.player.dungeon;

    for (idx in dungeon.things) {
        var thing = dungeon.things[idx];
        if ((thing.x == tx) && (thing.y == ty) && thing.blocks(this)) {
            thing.special(game);
        }
    }

    return dungeon.locations[ty][tx].look(this, tx, ty);
}

Game.prototype.doTurn = function() {
    this.specials();
    this.monster_move();
}

Game.prototype.specials = function() {
    for (idx in this.player.dungeon.things) {
        var thing = this.player.dungeon.things[idx];
        if ((this.player.x == thing.x) && (this.player.y == thing.y)) {
            thing.special(game);
        }
    }
}

Game.prototype.monster_move = function() {
    for (idx in this.player.dungeon.things) {
        this.player.dungeon.things[idx].move(this);
    }
}


Game.prototype.show_sprite = function(n) {
    if (!this.sprites) {
        this.sprites = load_sprites(sprite_src, sprite_palette);
    }
    this.sprite = n;
}

Game.prototype.hide_sprite = function() {
    if (this.sprite == 4) {
        // starting out
        play_sound(sound_start);
    }
    this.sprite = -1;
}

Game.prototype.drawMap = function() {
    var canvas = document.getElementById("view");
    var gc = canvas.getContext("2d");

    if (this.sprite == -1) {
        var dungeon = this.player.dungeon;
        var x = clip(this.player.x, view_radius, dungeon.width-view_radius-1);
        var y = clip(this.player.y, view_radius, dungeon.height-view_radius-1);
    
        dungeon.drawMap(game, gc, x, y);
        this.player.draw(gc, x, y);
    }
    else {
        for (var i=0; i <= 2*view_radius; i++) {
            for (var j=0; j <= 2*view_radius; j++) {
                gc.fillStyle = this.sprites[this.sprite][j][i];
                gc.fillRect(i*view_scale, j*view_scale, view_scale, view_scale);
            }
        }
        
    }
}

Game.prototype.keyDown = function(event) {
    if (this.finished) {
        // if game is finished, do nothing
        return;
    }
    if (this.sprite != -1) {
        this.hide_sprite();
        this.drawMap();
        return;
    }
    switch (event.keyCode) {
        case 32: this.magic(); break; // space
        case 37: this.move(-1, 0); break; // left
        case 38: this.move( 0,-1); break; // up
        case 39: this.move( 1, 0); break; // right
        case 40: this.move( 0, 1); break; // down
        default: return;
    }
    this.doTurn();
    this.drawMap();
}

Game.prototype.gameOver = function(why) {
    this.finished = true;
    if (why == "win") {
        play_sound(sound_win);
        this.show_sprite(9);
    }
    else {
        play_sound(sound_dead);
        this.show_sprite(3);
    }
}
