import Phaser from 'phaser';
import { WORLD } from '../config.js';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    this.load.image('slime001_default',   'Images/Enemies/area1/slime001_default.png');
    this.load.image('slime001_reaction',  'Images/Enemies/area1/slime001_reaction.png');
    this.load.image('slime001_attack',    'Images/Enemies/area1/slime001_attack.png');
    this.load.image('slime001_dead',      'Images/Enemies/area1/slime001_dead.png');
    this.load.image('slime_frowny_default', 'Images/Enemies/area1/FrownySlime.png');
    this.load.image('slime_silly_default', 'Images/Enemies/area1/SillySlime.png');
    this.load.image('slime_scared_default', 'Images/Enemies/area1/ScaredSlime.png');
    this.load.image('slime_worried_default', 'Images/Enemies/area1/WorriedSlime.png');
    this.load.image('slime_unfriendly_default', 'Images/Enemies/area1/UnfriendlySlime.png');
    this.load.image('slime_george_default', 'Images/Enemies/area1/George_.png');
    this.load.image('bg002_rear',   'Images/Backgrounds/area1/background002_rear.png');
    this.load.image('bg002_mid',    'Images/Backgrounds/area1/background002_mid.png');
    this.load.image('bg002_front',  'Images/Backgrounds/area1/background002_front.png');
    this.load.image('ground001',    'Images/Backgrounds/area1/ground001.png');
    this.load.image('foreground002', 'Images/Backgrounds/area1/foreground002.png');
    this.load.image('fern',         'Images/Backgrounds/area1/fern.png');
    this.load.image('fern002',      'Images/Backgrounds/area1/fern002.png');
    this.load.image('fg_bare',      'Images/Backgrounds/area1/foreground001_bare.png');
    this.load.image('fg_tree001',   'Images/Backgrounds/area1/foreground001_tree001.png');
    this.load.image('fg_tree002',   'Images/Backgrounds/area1/foreground001_tree002.png');
    this.load.image('fg_tree003',   'Images/Backgrounds/area1/foreground001_tree003.png');
    this.load.image('fg_tree004',   'Images/Backgrounds/area1/foreground001_tree004.png');

    // Area 2 backgrounds
    this.load.image('swamp_rear',      'Images/Backgrounds/area2/swampsky.png');
    this.load.image('swamp_mid',       'Images/Backgrounds/area2/Swampmidlayer.png');
    this.load.image('swamp_front',     'Images/Backgrounds/area2/swampforeground.png');
    this.load.image('swamptree001',    'Images/Backgrounds/area2/swamptree001.png');
    this.load.image('swamptree002',    'Images/Backgrounds/area2/swamptree002.png');
    this.load.image('swamptree003',    'Images/Backgrounds/area2/swamptree003.png');
    this.load.image('swamptree001_sm', 'Images/Backgrounds/area2/swamptree001.png');
    this.load.image('swamptree002_sm', 'Images/Backgrounds/area2/swamptree002.png');
    this.load.image('swamptree003_sm', 'Images/Backgrounds/area2/swamptree003.png');
    this.load.image('fog001',          'Images/Backgrounds/area2/fog001.png');
    this.load.image('fog002',          'Images/Backgrounds/area2/fog002.png');
    this.load.image('fog003',          'Images/Backgrounds/area2/fog003.png');
    this.load.image('clutter001',      'Images/Backgrounds/area2/clutter001.png');
    this.load.image('clutter002',      'Images/Backgrounds/area2/clutter002.png');
    this.load.image('clutter003',      'Images/Backgrounds/area2/clutter003.png');
    this.load.image('fallentree001',   'Images/Backgrounds/area2/fallentree001.png');
    this.load.image('swamp_path',      'Images/Backgrounds/area2/foregroundpath.png');

    // Area 2 enemy sprites
    this.load.image('goblin001_default',   'Images/Enemies/area2/goblin001_default.png');
    this.load.image('goblin001_reaction',  'Images/Enemies/area2/goblin001_reaction.png');
    this.load.image('goblin001_attack',    'Images/Enemies/area2/goblin001_attack.png');
    this.load.image('goblin001_dead',      'Images/Enemies/area2/goblin001_dead.png');
    this.load.image('bogzombie_default',   'Images/Enemies/area2/bogzombie_default.png');
    this.load.image('bogzombie_reaction',  'Images/Enemies/area2/bogzombie_reaction.png');
    this.load.image('bogzombie_attack',    'Images/Enemies/area2/bogzombie_attack.png');
    this.load.image('bogzombie_dead',      'Images/Enemies/area2/bogzombie_dead.png');
    this.load.image('bogzombie_dead2',     'Images/Enemies/area2/bogzombie_dead2.png');
    this.load.image('bogzombie_head',      'Images/Enemies/area2/bogzombie_head.png');
    this.load.image('blightcapfungi001_default',  'Images/Enemies/area2/blightcapfungi001_default.png');
    this.load.image('blightcapfungi001_default2', 'Images/Enemies/area2/blightcapfungi001_default2.png');
    this.load.image('blightcapfungi001_reaction', 'Images/Enemies/area2/blightcapfungi001_reaction.png');
    this.load.image('blightcapfungi001_attack',   'Images/Enemies/area2/blightcapfungi001_attack.png');
    this.load.image('blightcapfungi001_dead',     'Images/Enemies/area2/blightcapfungi001_dead.png');
    this.load.image('bogrevenant001_default',  'Images/Enemies/area2/bogrevenant001_default.png');
    this.load.image('bogrevenant001_reaction', 'Images/Enemies/area2/bogrevenant001_reaction.png');
    this.load.image('bogrevenant001_attack',   'Images/Enemies/area2/bogrevenant001_attack.png');
    this.load.image('bogrevenant001_dead',     'Images/Enemies/area2/bogrevenant001_dead.png');
    this.load.image('vinecrawler001_default',  'Images/Enemies/area2/vinecrawler001_default.png');
    this.load.image('vinecrawler001_reaction', 'Images/Enemies/area2/vinecrawler001_reaction.png');
    this.load.image('vinecrawler001_attack',   'Images/Enemies/area2/vinecrawler001_attack.png');
    this.load.image('vinecrawler001_dead',     'Images/Enemies/area2/vinecrawler001_dead.png');
    this.load.image('insectswarm001_default1',  'Images/Enemies/area2/insectswarm001_default1.png');
    this.load.image('insectswarm001_default2', 'Images/Enemies/area2/insectswarm001_default2.png');
    this.load.image('insectswarm001_reaction', 'Images/Enemies/area2/insectswarm001_reaction.png');
    this.load.image('insectswarm001_attack',   'Images/Enemies/area2/insectswarm001_attack.png');
    this.load.image('insectswarm001_dead',     'Images/Enemies/area2/insectswarm001_dead.png');
    this.load.image('goblinwarrior001_default',  'Images/Enemies/area2/goblinwarrior001_default.png');
    this.load.image('goblinwarrior001_reaction', 'Images/Enemies/area2/goblinwarrior001_reaction.png');
    this.load.image('goblinwarrior001_attack',   'Images/Enemies/area2/goblinwarrior001_attack.png');
    this.load.image('goblinwarrior001_dead',     'Images/Enemies/area2/goblinwarrior001_dead.png');
    this.load.image('thornbackboar2_default',  'Images/Enemies/area2/thornbackboar_default.png');
    this.load.image('thornbackboar2_reaction', 'Images/Enemies/area2/thornbackboar_reaction.png');
    this.load.image('thornbackboar2_attack',   'Images/Enemies/area2/thornbackboar_attack.png');
    this.load.image('thornbackboar2_dead',     'Images/Enemies/area2/thornbackboar_dead.png');
    this.load.image('forestrat001_default',  'Images/Enemies/area1/forestrat001_default.png');
    this.load.image('forestrat001_reaction', 'Images/Enemies/area1/forestrat001_reaction.png');
    this.load.image('forestrat001_attack',   'Images/Enemies/area1/forestrat001_attack.png');
    this.load.image('forestrat001_dead',     'Images/Enemies/area1/forestrat001_dead.png');

    // Area 1 enemy sprites
    this.load.image('feralhound_default',    'Images/Enemies/area1/feralhound_default.png');
    this.load.image('feralhound_reaction',   'Images/Enemies/area1/feralhound_reaction.png');
    this.load.image('feralhound_attack',     'Images/Enemies/area1/feralhound_attack.png');
    this.load.image('feralhound_dead',       'Images/Enemies/area1/feralhound_dead.png');
    this.load.image('thornbackboar_default',  'Images/Enemies/area1/thornbackboar_default.png');
    this.load.image('thornbackboar_reaction', 'Images/Enemies/area1/thornbackboar_reaction.png');
    this.load.image('thornbackboar_attack',   'Images/Enemies/area1/thornbackboar_attack.png');
    this.load.image('thornbackboar_dead',     'Images/Enemies/area1/thornbackboar_dead.png');
    this.load.image('blightedstalker_default',  'Images/Enemies/area1/blightedstalker_default.png');
    this.load.image('blightedstalker_reaction', 'Images/Enemies/area1/blightedstalker_reaction.png');
    this.load.image('blightedstalker_attack',   'Images/Enemies/area1/blightedstalker_attack.png');
    this.load.image('blightedstalker_dead',     'Images/Enemies/area1/blightedstalker_dead.png');
    this.load.image('blightedstalker_dead2',    'Images/Enemies/area1/blightedstalker_dead2.png');
    this.load.image('blightedstalker_head',     'Images/Enemies/area1/blightedstalker_head.png');
    this.load.image('razorwing001_default1', 'Images/Enemies/area1/razorwing001_default1.png');
    this.load.image('razorwing001_default2', 'Images/Enemies/area1/razorwing001_default2.png');
    this.load.image('razorwing001_reaction', 'Images/Enemies/area1/razorwing001_reaction.png');
    this.load.image('razorwing001_dead',     'Images/Enemies/area1/razorwing001_dead.png');
    this.load.image('greaterslime001_default',  'Images/Enemies/area1/greaterslime001_default.png');
    this.load.image('greaterslime001_reaction', 'Images/Enemies/area1/greaterslime001_reaction.png');
    this.load.image('greaterslime001_attack',   'Images/Enemies/area1/greaterslime001_attack.png');
    this.load.image('greaterslime001_dead',     'Images/Enemies/area1/greaterslime001_dead.png');
    this.load.image('armoredbeetle001_default',  'Images/Enemies/area1/armoredbeetle001_default.png');
    this.load.image('armoredbeetle001_reaction', 'Images/Enemies/area1/armoredbeetle001_reaction.png');
    this.load.image('armoredbeetle001_attack',   'Images/Enemies/area1/armoredbeetle001_attack.png');
    this.load.image('armoredbeetle001_dead',     'Images/Enemies/area1/armoredbeetle001_dead.png');
    this.load.image('roadbandit001_default',  'Images/Enemies/area1/roadbandit001_default.png');
    this.load.image('roadbandit001_reaction', 'Images/Enemies/area1/roadbandit001_reaction.png');
    this.load.image('roadbandit001_attack',   'Images/Enemies/area1/roadbandit001_attack.png');
    this.load.image('roadbandit001_dead',     'Images/Enemies/area1/roadbandit001_dead.png');
    this.load.image('crackedarmor001',       'Images/effects/crackedarmor001.png');

    // Start screen backgrounds
    this.load.image('start_sky',    'Images/Backgrounds/Start screen/background002_rear.png');
    this.load.image('start_ground', 'Images/Backgrounds/Start screen/foreground002.png');

    // Stance icons
    this.load.image('icon_tempest',  'Images/TempestIcon2.png');
    this.load.image('icon_ruin',     'Images/Breakerstance1.png');
    this.load.image('icon_fortress', 'Images/Fortressstance2.png');
    this.load.image('icon_flurry_button', 'Images/FlurryIcon2.png');
    this.load.image('icon_smash_button', 'Images/SmashIcon_.png');
    this.load.image('icon_bulwark_button', 'Images/BulwarkIcon.png');
    this.load.image('icon_drink_button', 'Images/DrinkIcon.png');
    this.load.image('icon_inventory_button', 'Images/InventoryIcon.png');
    this.load.image('icon_skills_button', 'Images/SkillsIcon.png');
    this.load.image('icon_stats_button', 'Images/StatsIcon.png');
    this.load.image('icon_settings_button', 'Images/SettingsIcon2.png');
    this.load.image('player001_default',        'Images/Player Images/armor001/Player001_default.png');
    this.load.image('player001_strongpunch',    'Images/Player Images/armor001/Player001_strongpunch.png');
    this.load.image('player001_jumpkick',       'Images/Player Images/armor001/Player001_jumpkick.png');
    this.load.image('player001_kick',           'Images/Player Images/armor001/Player001_kick.png');
    this.load.image('player001_elbow',          'Images/Player Images/armor001/Player001_elbow.png');
    this.load.image('player001_kneestrike',     'Images/Player Images/armor001/Player001_kneestrike.png');
    this.load.image('player001_roundhousekick', 'Images/Player Images/armor001/Player001_roundhousekick.png');
    this.load.image('player001_jab',            'Images/Player Images/armor001/Player001_jab.png');
    this.load.image('player001_hitreaction',    'Images/Player Images/armor001/Player001_hitreaction.png');
    this.load.image('player001_walk1',          'Images/Player Images/armor001/Player001_walk1.png');
    this.load.image('player001_walk3',          'Images/Player Images/armor001/Player001_walk3.png');
    this.load.image('fortressstance_001',      'Images/Player Images/armor001/fortressstance_001.png');
    this.load.image('fortressstance_002',      'Images/Player Images/armor001/fortressstance_002.png');
    this.load.image('powerstance_001charge',   'Images/Player Images/armor001/powerstance_001charge.png');

    // Armor002 player sprites
    this.load.image('player002_default',        'Images/Player Images/armor002/player001_default.png');
    this.load.image('player002_walk1',          'Images/Player Images/armor002/player001_walk1.png');
    this.load.image('player002_walk2',          'Images/Player Images/armor002/player001_walk2.png');
    this.load.image('player002_attack1',        'Images/Player Images/armor002/attack1.png');
    this.load.image('player002_attack2',        'Images/Player Images/armor002/attack2.png');
    this.load.image('player002_attack3',        'Images/Player Images/armor002/attack3.png');
    this.load.image('player002_attack4',        'Images/Player Images/armor002/attack4.png');
    this.load.image('player002_attack5',        'Images/Player Images/armor002/attack5.png');
    this.load.image('player002_stronghit',      'Images/Player Images/armor002/player001_stronghit.png');
    this.load.image('player002_hitreaction',    'Images/Player Images/armor002/player001_hitreaction.png');
    this.load.image('player002_charge',         'Images/Player Images/armor002/player001_charge.png');
    this.load.image('player002_fortressstance1','Images/Player Images/armor002/fortressstance001.png');
    this.load.image('player002_powerstance1',   'Images/Player Images/armor002/powerstance001.png');

    // Equipment thumbnails (128px pre-scaled for inventory/equip slots)
    this.load.image('weapon001_sharpstick', 'Images/equipment/weapon001_sharpstick_thumb.png');
    this.load.image('armor001_hide', 'Images/equipment/armor001_hide_thumb.png');
    this.load.image('armor001_pelt', 'Images/equipment/armor001_pelt_thumb.png');
    this.load.image('helm001_bonefragment', 'Images/equipment/helm001_bonefragment_thumb.png');
    this.load.image('helm001_houndskull', 'Images/equipment/helm001_houndskull_thumb.png');
    this.load.image('weapon001_boneshardblade', 'Images/equipment/weapon001_boneshardblade_thumb.png');
    this.load.image('weapon002_salvagedcleaver', 'Images/equipment/weapon002_salvagedcleaver_thumb.png');
    this.load.image('armor002_patchedleathervest', 'Images/equipment/armor002_patchedleathervest_thumb.png');
    this.load.image('helm002_leatherhood', 'Images/equipment/helm002_leatherhood_thumb.png');
    this.load.image('legs001_stitchedleggings', 'Images/equipment/legs001_stitchedleggings_thumb.png');
    this.load.image('boots001_worntravelersboots', 'Images/equipment/boots001_worntravelersboots_thumb.png');
    this.load.image('weapon002_frontierhatchet', 'Images/equipment/weapon002_frontierhatchet_thumb.png');
    this.load.image('armor002_rangerscoat', 'Images/equipment/armor002_rangerscoat_thumb.png');
    this.load.image('helm002_scoutshelfhelm', 'Images/equipment/helm002_scoutshelfhelm_thumb.png');
    this.load.image('boots001_wayfinderboots', 'Images/equipment/boots001_wayfinderboots_thumb.png');
    this.load.image('legs001_reinforcedtrousers', 'Images/equipment/legs001_reinforcedtrousers_thumb.png');
    this.load.image('weapon002_sharpenedvcleaver', 'Images/equipment/weapon002_sharpenedvcleaver_thumb.png');
    this.load.image('armor002_reinforcedleathervest', 'Images/equipment/armor002_reinforcedleathervest_thumb.png');
    this.load.image('helm002_boiledleatherhood', 'Images/equipment/helm002_boiledleatherhood_thumb.png');
    this.load.image('legs001_thickhideleggings', 'Images/equipment/legs001_thickhideleggings_thumb.png');
    this.load.image('boots001_mendedtravelersboots', 'Images/equipment/boots001_mendedtravelersboots_thumb.png');
    this.load.image('weapon003_reclaimedshortsword', 'Images/equipment/weapon003_reclaimedshortsword_thumb.png');
    this.load.image('armor003_roadwardenshauberk', 'Images/equipment/armor003_roadwardenshauberk_thumb.png');
    this.load.image('helm003_stone-carvedhalfhelm', 'Images/equipment/helm003_stone-carvedhalfhelm_thumb.png');
    this.load.image('legs002_roadwardensgreaves', 'Images/equipment/legs002_roadwardensgreaves_thumb.png');
    this.load.image('boots002_ironshodmarchingboots', 'Images/equipment/boots002_ironshodmarchingboots_thumb.png');
    this.load.image('hands001_scavengedgauntlets', 'Images/equipment/hands001_scavengedgauntlets_thumb.png');
    this.load.image('weapon003_sentinelsblade', 'Images/equipment/weapon003_sentinelsblade_thumb.png');
    this.load.image('helm003_sentinelsvisage', 'Images/equipment/helm003_sentinelsvisage_thumb.png');
    this.load.image('boots002_sentineltreads', 'Images/equipment/boots002_sentineltreads_thumb.png');
    this.load.image('hands001_sentinelgauntlets', 'Images/equipment/hands001_sentinelgauntlets_thumb.png');
    this.load.image('amulet001_crackedhearthstone', 'Images/equipment/amulet001_crackedhearthstone_thumb.png');
    this.load.image('weapon003_wardensoath', 'Images/equipment/weapon003_wardensoath_thumb.png');
    this.load.image('boots002_pathfindersstride', 'Images/equipment/boots002_pathfindersstride_thumb.png');
    this.load.image('hands001_irongripgauntlets', 'Images/equipment/hands001_irongripgauntlets_thumb.png');
    this.load.image('armor003_sentinelhalfplate', 'Images/equipment/armor003_sentinelhalfplate_thumb.png');
    this.load.image('armor003_ancientsentinelplate', 'Images/equipment/armor003_ancientsentinelplate_thumb.png');
    this.load.image('legs002_sentinelgreaves', 'Images/equipment/legs002_sentinelgreaves_thumb.png');
    this.load.image('legs002_stoneguardlegplates', 'Images/equipment/legs002_stoneguardlegplates_thumb.png');
    this.load.image('waterskin001', 'Images/equipment/waterskin001_thumb.png');

  }

  create() {
    console.log(`[BootScene] create — canvas ${WORLD.width}x${WORLD.height}`);

    // Pre-downscale large combat sprites via canvas (high-quality Lanczos)
    // so WebGL only needs ≤2× bilinear at runtime.
    this._downscaleCombatSprites();

    const cx = WORLD.width / 2;
    const cy = WORLD.height / 2;

    // Green rectangle — proof of life
    const rect = this.add.rectangle(cx, cy, 400, 300, 0x22c55e);

    // Label
    this.add.text(cx, cy, 'Phase 0 Complete', {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // Gentle pulse tween to show the update loop is running
    this.tweens.add({
      targets: rect,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    console.log('[BootScene] lifecycle complete — rectangle rendered');

    // Transition to StartScene after brief display
    this.time.delayedCall(1000, () => {
      this.scene.start('StartScene');
    });
  }

  /**
   * Replace oversized combat sprite textures with canvas-downscaled versions.
   * Target = 2× display size so WebGL bilinear handles the final 2× cleanly.
   */
  _downscaleCombatSprites() {
    // Player sprites — all displayed at ~300×375
    const playerTarget = { w: 600, h: 750 };
    const playerKeys = [
      'player001_default', 'player001_strongpunch', 'player001_jumpkick',
      'player001_kick', 'player001_elbow', 'player001_kneestrike',
      'player001_roundhousekick', 'player001_jab', 'player001_hitreaction',
      'player001_walk1', 'player001_walk3',
      'fortressstance_001', 'fortressstance_002',
      'powerstance_001charge',
      // Armor002
      'player002_default', 'player002_walk1', 'player002_walk2',
      'player002_attack1', 'player002_attack2', 'player002_attack3',
      'player002_attack4', 'player002_attack5',
      'player002_stronghit', 'player002_hitreaction', 'player002_charge',
      'player002_fortressstance1', 'player002_powerstance1',
    ];
    for (const key of playerKeys) {
      this._downscaleTexture(key, playerTarget.w, playerTarget.h);
    }

    // Enemy sprites — 2× each enemy's spriteSize
    const enemyGroups = [
      {
        keys: [
          'slime001_default',
          'slime001_reaction',
          'slime001_attack',
          'slime001_dead',
          'slime_frowny_default',
          'slime_silly_default',
          'slime_scared_default',
          'slime_worried_default',
          'slime_unfriendly_default',
          'slime_george_default',
        ],
        w: 320,
        h: 480,
      },
      { keys: ['forestrat001_default', 'forestrat001_reaction', 'forestrat001_attack', 'forestrat001_dead'], w: 250, h: 250 },
      { keys: ['feralhound_default', 'feralhound_reaction', 'feralhound_attack', 'feralhound_dead'], w: 512, h: 280 },
      { keys: ['thornbackboar_default', 'thornbackboar_reaction', 'thornbackboar_attack', 'thornbackboar_dead'], w: 560, h: 306 },
      { keys: ['razorwing001_default1', 'razorwing001_default2', 'razorwing001_reaction', 'razorwing001_dead'], w: 400, h: 400 },
      { keys: ['greaterslime001_default', 'greaterslime001_reaction', 'greaterslime001_attack', 'greaterslime001_dead'], w: 840, h: 672 },
      { keys: ['armoredbeetle001_default', 'armoredbeetle001_reaction', 'armoredbeetle001_attack', 'armoredbeetle001_dead'], w: 400, h: 400 },
      { keys: ['roadbandit001_default', 'roadbandit001_reaction', 'roadbandit001_attack', 'roadbandit001_dead'], w: 512, h: 512 },
      { keys: ['blightedstalker_default', 'blightedstalker_reaction', 'blightedstalker_attack', 'blightedstalker_dead', 'blightedstalker_dead2'], w: 396, h: 478 },
      { keys: ['blightedstalker_head'], w: 160, h: 160 },
      { keys: ['blightcapfungi001_default', 'blightcapfungi001_default2', 'blightcapfungi001_reaction', 'blightcapfungi001_attack', 'blightcapfungi001_dead'], w: 288, h: 346 },
      { keys: ['bogrevenant001_default', 'bogrevenant001_reaction', 'bogrevenant001_attack', 'bogrevenant001_dead'], w: 540, h: 652 },
      { keys: ['vinecrawler001_default', 'vinecrawler001_reaction', 'vinecrawler001_attack', 'vinecrawler001_dead'], w: 600, h: 328 },
      { keys: ['insectswarm001_default1', 'insectswarm001_default2', 'insectswarm001_reaction', 'insectswarm001_attack', 'insectswarm001_dead'], w: 360, h: 360 },
      { keys: ['goblinwarrior001_default', 'goblinwarrior001_reaction', 'goblinwarrior001_attack', 'goblinwarrior001_dead'], w: 320, h: 384 },
      { keys: ['crackedarmor001'], w: 512, h: 512 },
      { keys: ['icon_tempest', 'icon_ruin', 'icon_fortress'], w: 128, h: 128 },
      { keys: ['icon_flurry_button', 'icon_smash_button', 'icon_bulwark_button', 'icon_drink_button'], w: 128, h: 128 },
      { keys: ['icon_inventory_button', 'icon_skills_button', 'icon_stats_button', 'icon_settings_button'], w: 128, h: 128 },
    ];
    for (const { keys, w, h } of enemyGroups) {
      for (const key of keys) {
        this._downscaleTexture(key, w, h);
      }
    }

    // Background parallax sprites — downscale to ~2× max display size
    const bgSprites = [
      { keys: ['swamptree001', 'swamptree002', 'swamptree003', 'fallentree001'], w: 400, h: 600 },
      { keys: ['swamptree001_sm', 'swamptree002_sm', 'swamptree003_sm'], w: 90, h: 136 },
      { keys: ['clutter001', 'clutter002', 'clutter003'], w: 200, h: 200 },
      { keys: ['goblin001_default', 'goblin001_reaction', 'goblin001_attack', 'goblin001_dead'], w: 320, h: 320 },
      { keys: ['bogzombie_default', 'bogzombie_reaction', 'bogzombie_attack', 'bogzombie_dead', 'bogzombie_dead2'], w: 400, h: 480 },
      { keys: ['bogzombie_head'], w: 160, h: 160 },
      { keys: ['thornbackboar2_default', 'thornbackboar2_reaction', 'thornbackboar2_attack', 'thornbackboar2_dead'], w: 560, h: 306 },
    ];
    for (const { keys, w, h } of bgSprites) {
      for (const key of keys) {
        this._downscaleTexture(key, w, h);
      }
    }
  }

  /** Canvas-downscale a single texture to targetW×targetH using browser Lanczos. */
  _downscaleTexture(key, targetW, targetH) {
    const texture = this.textures.get(key);
    if (!texture || texture.key === '__MISSING') return;
    const source = texture.getSourceImage();
    if (!source) return;
    // Skip if source is already at or below target size
    if (source.width <= targetW && source.height <= targetH) return;

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, targetW, targetH);

    this.textures.remove(key);
    this.textures.addCanvas(key, canvas);
  }
}
