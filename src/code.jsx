import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";

const PI = Math.PI;

// ─────────────────────────────────────────────────────────────────────────────
// MATERIALS
// ─────────────────────────────────────────────────────────────────────────────
const mkWood  = () => new THREE.MeshPhongMaterial({ color:0xE8C49A, specular:0x3A2A12, shininess:28 });
const mkJoint = () => new THREE.MeshPhongMaterial({ color:0xD4A870, specular:0x2A1A08, shininess:22 });
const mkDark  = () => new THREE.MeshPhongMaterial({ color:0xB08040, specular:0x1A0800, shininess:15 });
const mkSel   = () => new THREE.MeshPhongMaterial({ color:0xFF7030, specular:0x5A2010, shininess:40 });
const mkBase  = () => new THREE.MeshPhongMaterial({ color:0xC89050, specular:0x2A1808, shininess:18 });
const mkFloor = () => new THREE.MeshLambertMaterial({ color:0x8B6914 });

// ─────────────────────────────────────────────────────────────────────────────
// POSES
// HIP Z-AXIS RULE (fixes crossed legs bug):
//   leftHip  z NEGATIVE = left  leg spreads OUT to the left  ✓
//   rightHip z POSITIVE = right leg spreads OUT to the right ✓
//   (old code had these REVERSED — that's why legs crossed)
// ─────────────────────────────────────────────────────────────────────────────
const POSE_DEFS = {
  // ── BASIC ──────────────────────────────────────────────────────────────────
  neutral: {
    label:"Neutral", cat:"basic",
    j:{ leftShoulder:{z:-0.10}, rightShoulder:{z:0.10},
        leftHip:{z:-0.06}, rightHip:{z:0.06} }
  },
  tpose: {
    label:"T-Pose", cat:"basic",
    j:{ leftShoulder:{z:-PI/2+0.04}, rightShoulder:{z:PI/2-0.04},
        leftHip:{z:-0.06}, rightHip:{z:0.06} }
  },
  atpose: {
    label:"A-Pose", cat:"basic",
    j:{ leftShoulder:{z:-PI/4}, rightShoulder:{z:PI/4},
        leftHip:{z:-0.06}, rightHip:{z:0.06} }
  },
  sitting: {
    label:"Sitting", cat:"basic",
    j:{ spine:{x:PI/18},
        leftHip:{x:-PI/2, z:-0.06},  rightHip:{x:-PI/2, z:0.06},
        leftKnee:{x:PI/2},            rightKnee:{x:PI/2},
        leftAnkle:{x:-PI/10},         rightAnkle:{x:-PI/10},
        leftShoulder:{z:-0.10},       rightShoulder:{z:0.10} }
  },
  walking: {
    label:"Walking", cat:"basic",
    j:{ spine:{x:PI/20, z:PI/30},
        leftShoulder:{x:-PI/5, z:-0.10},  rightShoulder:{x:PI/5, z:0.10},
        leftElbow:{x:PI/9},               rightElbow:{x:PI/9},
        leftHip:{x:PI/5, z:-0.06},        rightHip:{x:-PI/4.5, z:0.06},
        leftKnee:{x:PI/12},               rightKnee:{x:PI/18},
        leftAnkle:{x:PI/16},              rightAnkle:{x:-PI/20} }
  },
  running: {
    label:"Running", cat:"basic",
    j:{ spine:{x:PI/11, z:PI/24},
        leftShoulder:{x:-PI/2.6, z:-0.10}, rightShoulder:{x:PI/2.2, z:0.10},
        leftElbow:{x:PI/2.6},              rightElbow:{x:PI/2.8},
        leftHip:{x:PI/2.5, z:-0.06},       rightHip:{x:-PI/2.2, z:0.06},
        leftKnee:{x:PI/3.8},               rightKnee:{x:PI/2.8},
        leftAnkle:{x:PI/10},               rightAnkle:{x:-PI/7} }
  },
  jumping: {
    label:"Jumping", cat:"basic",
    j:{ spine:{x:-PI/22},
        leftShoulder:{x:PI*0.62, z:-PI/9},  rightShoulder:{x:PI*0.62, z:PI/9},
        leftElbow:{x:-PI/12},               rightElbow:{x:-PI/12},
        leftHip:{x:PI/6, z:-PI/10},         rightHip:{x:PI/6, z:PI/10},
        leftKnee:{x:-PI/8},                 rightKnee:{x:-PI/8},
        leftAnkle:{x:PI/9},                 rightAnkle:{x:PI/9} }
  },
  waving: {
    label:"Waving", cat:"basic",
    j:{ spine:{z:PI/30},
        rightShoulder:{x:-PI/2.2, z:PI/2.2}, rightElbow:{x:PI/2.2},
        leftShoulder:{z:-0.10},
        leftHip:{z:-0.06}, rightHip:{z:0.06} }
  },
  lookingUp: {
    label:"Look Up", cat:"basic",
    j:{ neck:{x:-PI/4.5}, head:{x:-PI/9}, spine:{x:-PI/24},
        leftHip:{z:-0.06}, rightHip:{z:0.06} }
  },
  crouching: {
    label:"Crouch", cat:"basic",
    j:{ spine:{x:PI/7}, abdomen:{x:PI/14},
        leftHip:{x:-PI/1.7, z:-PI/10},  rightHip:{x:-PI/1.7, z:PI/10},
        leftKnee:{x:PI/1.65},            rightKnee:{x:PI/1.65},
        leftAnkle:{x:PI/7},              rightAnkle:{x:PI/7},
        leftShoulder:{x:PI/8, z:-0.12},  rightShoulder:{x:PI/8, z:0.12} }
  },
  kneeling: {
    label:"Kneeling", cat:"basic",
    j:{ spine:{x:PI/26},
        leftHip:{x:-PI/2, z:-0.06},  rightHip:{x:-PI*0.82, z:0.06},
        leftKnee:{x:PI/2},            rightKnee:{x:PI*0.82},
        leftAnkle:{x:-PI/10},         rightAnkle:{x:PI/5} }
  },

  // ── COMBAT ─────────────────────────────────────────────────────────────────
  fightStance: {
    label:"Fight Stance", cat:"combat",
    j:{ spine:{x:PI/14, y:PI/12}, abdomen:{x:PI/20},
        leftShoulder:{x:PI/9, z:-PI/13},   rightShoulder:{x:PI/8, z:PI/12},
        leftElbow:{x:PI/2.3},              rightElbow:{x:PI/2.5},
        leftHip:{x:PI/18, z:-PI/7},        rightHip:{x:PI/18, z:PI/7},
        leftKnee:{x:PI/11},                rightKnee:{x:PI/10},
        leftAnkle:{x:PI/18},               rightAnkle:{x:PI/18} }
  },
  heavyPunch: {
    label:"Heavy Punch", cat:"combat",
    j:{ spine:{x:PI/12, y:-PI/8}, abdomen:{x:PI/18},
        leftShoulder:{x:PI*0.60, z:-PI/10}, leftElbow:{x:PI*0.85},
        rightShoulder:{x:PI/10, z:PI/8},    rightElbow:{x:PI/6},
        leftHip:{x:PI/10, z:-PI/8},         rightHip:{x:-PI/12, z:PI/8},
        leftKnee:{x:PI/14} }
  },
  jab: {
    label:"Jab", cat:"combat",
    j:{ spine:{x:PI/14, y:PI/11}, abdomen:{x:PI/20},
        rightShoulder:{x:PI*0.72, z:PI/20}, rightElbow:{x:PI/14},
        leftShoulder:{x:PI/7, z:-PI/9},     leftElbow:{x:PI/2.5},
        leftHip:{x:PI/20, z:-PI/8},         rightHip:{x:PI/20, z:PI/8} }
  },
  uppercut: {
    label:"Uppercut", cat:"combat",
    j:{ spine:{x:PI/11, y:-PI/10}, abdomen:{x:PI/16},
        leftShoulder:{x:PI/4, z:-PI/9},    leftElbow:{x:PI/1.5},
        rightShoulder:{x:PI*0.5, z:PI/11}, rightElbow:{x:PI/3.2},
        leftHip:{x:PI/10, z:-PI/8},        rightHip:{x:-PI/12, z:PI/8},
        leftKnee:{x:PI/12} }
  },
  kick: {
    label:"Front Kick", cat:"combat",
    j:{ spine:{x:PI/13},
        rightHip:{x:PI*0.70, z:0.04},   rightKnee:{x:-PI/4},
        rightAnkle:{x:PI/9},
        leftHip:{x:-PI/16, z:-PI/12},   leftKnee:{x:PI/10},
        leftShoulder:{x:PI/8, z:-PI/9}, rightShoulder:{x:PI/7, z:PI/9},
        leftElbow:{x:PI/6},             rightElbow:{x:PI/5} }
  },
  sideKick: {
    label:"Side Kick", cat:"combat",
    j:{ spine:{x:PI/15, z:-PI/12},
        rightHip:{x:PI/4, z:PI/2.4},    rightKnee:{x:-PI/12},
        rightAnkle:{x:PI/12},
        leftHip:{z:-PI/10},             leftKnee:{x:PI/18},
        leftShoulder:{x:PI/6, z:-PI/8}, rightShoulder:{x:PI/5, z:PI/8} }
  },
  spinKick: {
    label:"Spin Kick", cat:"combat",
    j:{ spine:{x:PI/12, y:PI/5}, abdomen:{y:PI/9},
        rightHip:{x:PI*0.65, z:PI/16},  rightKnee:{x:-PI/4.5},
        leftHip:{x:-PI/14, z:-PI/10},   leftKnee:{x:PI/8},
        leftShoulder:{x:PI/6, z:-PI/7}, rightShoulder:{x:PI/6, z:PI/6} }
  },
  block: {
    label:"Block", cat:"combat",
    j:{ spine:{x:PI/13, y:PI/15}, abdomen:{x:PI/20},
        leftShoulder:{x:PI*0.48, z:-PI/10}, leftElbow:{x:PI/2.3},
        rightShoulder:{x:PI*0.48, z:PI/10}, rightElbow:{x:PI/2.3},
        neck:{x:-PI/15},
        leftHip:{x:PI/18, z:-PI/8},         rightHip:{x:PI/18, z:PI/8},
        leftKnee:{x:PI/13},                 rightKnee:{x:PI/13} }
  },
  dodge: {
    label:"Dodge", cat:"combat",
    j:{ spine:{x:PI/10, z:-PI/10}, abdomen:{x:PI/18, z:-PI/18},
        neck:{x:PI/15, z:PI/13},
        leftShoulder:{x:PI/9, z:-PI/11},  rightShoulder:{x:PI/7, z:PI/8},
        leftElbow:{x:PI/4},               rightElbow:{x:PI/2.5},
        leftHip:{x:-PI/8, z:-PI/8},       rightHip:{x:PI/7, z:PI/8},
        leftKnee:{x:PI/8} }
  },
  exhausted: {
    label:"Exhausted", cat:"combat",
    j:{ spine:{x:PI/2.8}, abdomen:{x:PI/10},
        neck:{x:-PI/7}, head:{x:-PI/11},
        leftShoulder:{x:PI/4, z:-PI/8},  rightShoulder:{x:PI/4, z:PI/8},
        leftElbow:{x:PI/3.2},            rightElbow:{x:PI/3.2},
        leftHip:{x:-PI/4, z:-PI/9},      rightHip:{x:-PI/4, z:PI/9},
        leftKnee:{x:PI/3},               rightKnee:{x:PI/3},
        leftAnkle:{x:PI/16},             rightAnkle:{x:PI/16} }
  },
  knockdown: {
    label:"Knockdown", cat:"combat",
    j:{ spine:{x:PI*0.55}, abdomen:{x:PI/8},
        neck:{x:-PI/8}, head:{x:-PI/12},
        leftShoulder:{x:PI*0.25, z:-PI/4},  rightShoulder:{x:PI*0.25, z:PI/5.5},
        leftElbow:{x:PI/4},                 rightElbow:{x:PI/5},
        leftHip:{x:-PI*0.50, z:-PI/10},     rightHip:{x:-PI*0.36, z:PI/12},
        leftKnee:{x:PI*0.55},               rightKnee:{x:PI*0.40} }
  },
  victory: {
    label:"Victory", cat:"combat",
    j:{ spine:{x:-PI/20},
        leftShoulder:{x:PI, z:-PI/9},  rightShoulder:{x:PI, z:PI/9},
        leftElbow:{x:-PI/12},          rightElbow:{x:-PI/12},
        neck:{x:-PI/15},
        leftHip:{z:-PI/10},            rightHip:{z:PI/10} }
  },
  grapple: {
    label:"Grapple", cat:"combat",
    j:{ spine:{x:PI/9}, abdomen:{x:PI/15},
        leftShoulder:{x:PI*0.55, z:-PI/11},  rightShoulder:{x:PI*0.55, z:PI/11},
        leftElbow:{x:PI/2.4},                rightElbow:{x:PI/2.4},
        leftHip:{x:-PI/7, z:-PI/8},          rightHip:{x:-PI/7, z:PI/8},
        leftKnee:{x:PI/7},                   rightKnee:{x:PI/7} }
  },

  // ── POWER ──────────────────────────────────────────────────────────────────
  powerUp: {
    label:"Power Up", cat:"power",
    j:{ spine:{x:-PI/12}, abdomen:{x:-PI/20},
        leftShoulder:{x:PI/3.5, z:-PI/4.2}, rightShoulder:{x:PI/3.5, z:PI/4.2},
        leftElbow:{x:PI/3.2},               rightElbow:{x:PI/3.2},
        leftWrist:{x:-PI/9},                rightWrist:{x:-PI/9},
        leftHip:{z:-PI/9},                  rightHip:{z:PI/9},
        leftKnee:{x:PI/12},                 rightKnee:{x:PI/12},
        neck:{x:-PI/11}, head:{x:-PI/15} }
  },
  chargeUp: {
    label:"Charge Up", cat:"power",
    j:{ spine:{x:-PI/11}, abdomen:{x:-PI/17},
        leftShoulder:{x:PI*0.58, z:-PI/4},  rightShoulder:{x:PI*0.58, z:PI/4},
        leftElbow:{x:PI/3.8},               rightElbow:{x:PI/3.8},
        leftWrist:{x:-PI/8, z:PI/8},        rightWrist:{x:-PI/8, z:-PI/8},
        leftHip:{z:-PI/9},                  rightHip:{z:PI/9},
        leftKnee:{x:PI/11},                 rightKnee:{x:PI/11},
        neck:{x:-PI/10}, head:{x:-PI/13} }
  },
  energyBall: {
    label:"Energy Ball", cat:"power",
    j:{ spine:{x:PI/16}, abdomen:{x:PI/24},
        leftShoulder:{x:PI*0.50, z:-PI/6},  rightShoulder:{x:PI*0.50, z:PI/6},
        leftElbow:{x:PI/2.2},               rightElbow:{x:PI/2.2},
        leftWrist:{z:PI/6},                 rightWrist:{z:-PI/6},
        leftHip:{z:-0.06},                  rightHip:{z:0.06},
        neck:{x:PI/15} }
  },
  kamehameha: {
    label:"Kamehameha", cat:"power",
    j:{ spine:{x:PI/12, z:PI/18}, abdomen:{x:PI/20},
        leftShoulder:{x:PI*0.65, z:PI/18},  rightShoulder:{x:PI*0.65, z:PI/14},
        leftElbow:{x:PI/14},                rightElbow:{x:PI/14},
        leftWrist:{z:-PI/9},                rightWrist:{z:-PI/9},
        leftHip:{x:-PI/10, z:-PI/9},        rightHip:{x:PI/9, z:PI/9},
        leftKnee:{x:PI/11},
        neck:{x:PI/15} }
  },
  forcePush: {
    label:"Force Push", cat:"power",
    j:{ spine:{x:PI/11}, abdomen:{x:PI/18},
        leftShoulder:{x:PI*0.76, z:-PI/14}, leftElbow:{x:PI/16},
        rightShoulder:{x:PI*0.76, z:PI/14}, rightElbow:{x:PI/16},
        leftWrist:{x:-PI/9},                rightWrist:{x:-PI/9},
        leftHip:{z:-PI/9},                  rightHip:{z:PI/9},
        leftKnee:{x:PI/13},                 rightKnee:{x:PI/13} }
  },
  forceLift: {
    label:"Force Lift", cat:"power",
    j:{ spine:{x:-PI/15}, abdomen:{x:-PI/22},
        leftShoulder:{x:PI*0.80, z:-PI/11},  rightShoulder:{x:PI*0.80, z:PI/11},
        leftElbow:{x:PI/15},                 rightElbow:{x:PI/15},
        leftWrist:{x:-PI/8, z:PI/10},        rightWrist:{x:-PI/8, z:-PI/10},
        leftHip:{z:-0.06},                   rightHip:{z:0.06},
        neck:{x:-PI/10} }
  },
  superhero: {
    label:"Superhero", cat:"power",
    j:{ spine:{x:-PI/22}, abdomen:{x:-PI/30},
        leftShoulder:{z:-PI/2.5},   rightShoulder:{z:PI/2.5},
        leftElbow:{z:PI/18},        rightElbow:{z:-PI/18},
        leftHip:{z:-PI/16},         rightHip:{z:PI/16},
        neck:{x:-PI/18} }
  },
  meditating: {
    label:"Meditate", cat:"power",
    j:{ spine:{x:-PI/22},
        leftShoulder:{x:PI/4.5, z:-PI/5.5},  rightShoulder:{x:PI/4.5, z:PI/5.5},
        leftElbow:{x:PI/2.3},                rightElbow:{x:PI/2.3},
        leftWrist:{z:PI/7},                  rightWrist:{z:-PI/7},
        leftHip:{x:-PI/2, z:-PI/12},         rightHip:{x:-PI/2, z:PI/12},
        leftKnee:{x:PI/2},                   rightKnee:{x:PI/2},
        neck:{x:-PI/20} }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// BOT RULES
// ─────────────────────────────────────────────────────────────────────────────
const BOT_RULES = [
  [/\bt[-\s]?pose\b|arms?\s*(out|wide|spread)/i,    "tpose"],
  [/\ba[-\s]?pose\b/i,                               "atpose"],
  [/\bneutral\b|\bdefault\b|\bstand(ing)?\b|\brest\b|\bidle\b/i, "neutral"],
  [/\bsit(ting)?\b|\bseated?\b/i,                    "sitting"],
  [/\bwalk(ing)?\b/i,                                "walking"],
  [/\brun(ning)?\b|\bsprint/i,                       "running"],
  [/\bjump(ing)?\b|\bleap/i,                         "jumping"],
  [/\bwav(e|ing)\b|\bhello\b/i,                      "waving"],
  [/look.?up|head.?up/i,                             "lookingUp"],
  [/\bcrouch(ing)?\b|\bsquat/i,                      "crouching"],
  [/\bkneel(ing)?\b/i,                               "kneeling"],
  [/fight.?stance|ready.?fight|martial|karate|kung.?fu|fighting?\s*pose/i, "fightStance"],
  [/heavy.?punch|strong.?punch/i,                    "heavyPunch"],
  [/\bjab\b|\bquick.?punch/i,                        "jab"],
  [/upper.?cut/i,                                    "uppercut"],
  [/\bfront.?kick|kick(?!.{0,6}spin|.{0,6}side)/i,  "kick"],
  [/side.?kick/i,                                    "sideKick"],
  [/spin.?kick|tornado.?kick|roundhouse/i,           "spinKick"],
  [/\bblock(ing)?\b|\bdefend/i,                      "block"],
  [/\bdodge|evade|duck/i,                            "dodge"],
  [/exhaust(ed)?|tired|out.?of.?breath|after.?fight/i, "exhausted"],
  [/knock.?down|fell|ground/i,                       "knockdown"],
  [/victor(y|ious)|winner|triumph/i,                 "victory"],
  [/\bgrapple|grab|hold/i,                           "grapple"],
  [/power.?up|power.*?\bup\b/i,                      "powerUp"],
  [/charge.?up|charging/i,                           "chargeUp"],
  [/energy.?ball/i,                                  "energyBall"],
  [/kamehameha|kame/i,                               "kamehameha"],
  [/force.?push/i,                                   "forcePush"],
  [/force.?lift|telekin/i,                           "forceLift"],
  [/super.?hero|cape|fly/i,                          "superhero"],
  [/\bmeditat(e|ing)\b|\bzen\b/i,                    "meditating"],
  [/\bpunch(ing)?\b/i,                               "heavyPunch"],
  [/\bkick(ing)?\b/i,                                "kick"],
  [/\bfight(ing)?\b/i,                               "fightStance"],
];

const JOINT_RULES = [
  [/raise\s+left\s+arm|left\s+arm\s*(up|high)/i,      j=>{j.leftShoulder.rotation.x=PI;}],
  [/raise\s+right\s+arm|right\s+arm\s*(up|high)/i,    j=>{j.rightShoulder.rotation.x=PI;}],
  [/raise\s+(both\s+)?arms?|both\s+arms?\s*(up|high)/i,j=>{j.leftShoulder.rotation.x=PI;j.rightShoulder.rotation.x=PI;}],
  [/lower\s+left\s+arm/i,   j=>{j.leftShoulder.rotation.set(0,0,0);}],
  [/lower\s+right\s+arm/i,  j=>{j.rightShoulder.rotation.set(0,0,0);}],
  [/bend\s+left\s+knee/i,   j=>{j.leftKnee.rotation.x=PI/2;}],
  [/bend\s+right\s+knee/i,  j=>{j.rightKnee.rotation.x=PI/2;}],
  [/bend\s+(both\s+)?knees?/i,j=>{j.leftKnee.rotation.x=PI/2;j.rightKnee.rotation.x=PI/2;}],
  [/tilt\s+head\s+left/i,   j=>{j.head.rotation.z=PI/5;}],
  [/tilt\s+head\s+right/i,  j=>{j.head.rotation.z=-PI/5;}],
  [/turn\s+head\s+left|look\s+left/i,   j=>{j.neck.rotation.y=-PI/3;}],
  [/turn\s+head\s+right|look\s+right/i, j=>{j.neck.rotation.y=PI/3;}],
  [/look\s+up|head\s+up/i,  j=>{j.neck.rotation.x=-PI/4;}],
  [/look\s+down|head\s+down/i,j=>{j.neck.rotation.x=PI/5;}],
  [/lean\s+left/i,  j=>{j.spine.rotation.z=PI/7;}],
  [/lean\s+right/i, j=>{j.spine.rotation.z=-PI/7;}],
  [/lean\s+forward/i,j=>{j.spine.rotation.x=PI/4;if(j.abdomen)j.abdomen.rotation.x=PI/10;}],
  [/bend\s+left\s+elbow/i,  j=>{j.leftElbow.rotation.x=PI/2;}],
  [/bend\s+right\s+elbow/i, j=>{j.rightElbow.rotation.x=PI/2;}],
];

const CAT_CLR = { basic:"#7B8EE8", combat:"#E84A4A", power:"#E8C22A" };

// ─────────────────────────────────────────────────────────────────────────────
// MANNEQUIN BUILDER — matches wooden mannequin photo
// ─────────────────────────────────────────────────────────────────────────────
function buildMannequin(scene, jointsRef, bodyMeshesRef, m2jRef) {
  const jmap = {};
  const meshes = [];
  const m2j = new Map();

  function addMesh(parent, mesh, jName, castShadow=true) {
    if (castShadow) mesh.castShadow = true;
    parent.add(mesh);
    if (jName) { meshes.push(mesh); m2j.set(mesh, jName); }
    return mesh;
  }

  function jg(parent, name, x, y, z) {
    const g = new THREE.Group(); g.name = name;
    g.position.set(x,y,z); parent.add(g); jmap[name]=g; return g;
  }

  // ── Smooth rounded shapes ──────────────────────────────────────────────────
  function roundedCyl(rt, rb, h, segs=14) {
    const g = new THREE.CylinderGeometry(rt, rb, h, segs, 1, false);
    return g;
  }
  function ball(r, segs=16) { return new THREE.SphereGeometry(r, segs, segs); }
  function ellipsoid(rx, ry, rz, segs=14) {
    const g = new THREE.SphereGeometry(1, segs, segs);
    g.applyMatrix4(new THREE.Matrix4().makeScale(rx, ry, rz));
    return g;
  }

  const root = new THREE.Group(); scene.add(root);

  // ── Wood base ──────────────────────────────────────────────────────────────
  const baseM = new THREE.Mesh(new THREE.CylinderGeometry(0.72,0.78,0.09,24), mkBase());
  baseM.position.set(0,0.045,0); baseM.receiveShadow=true; root.add(baseM);
  const rodM = new THREE.Mesh(new THREE.CylinderGeometry(0.012,0.012,4.5,8), mkDark());
  rodM.position.set(0,2.3,-0.18); root.add(rodM);

  // ── ROOT — hips ────────────────────────────────────────────────────────────
  const hips = jg(root,"hips",0,4.55,0);

  // Pelvis block — wider and rounded like photo
  const pelvisMesh = new THREE.Mesh(ellipsoid(0.30,0.28,0.22,14), mkWood());
  pelvisMesh.position.y = -0.14;
  addMesh(hips, pelvisMesh, "hips");

  // ── ABDOMEN ────────────────────────────────────────────────────────────────
  const abdomen = jg(hips,"abdomen",0,0.10,0);
  const abJoint = new THREE.Mesh(ball(0.16,12), mkJoint());
  addMesh(abdomen, abJoint, "abdomen");
  const abMesh = new THREE.Mesh(ellipsoid(0.20,0.22,0.17,12), mkWood());
  abMesh.position.y = 0.28;
  addMesh(abdomen, abMesh, "abdomen");

  // ── SPINE → CHEST ─────────────────────────────────────────────────────────
  const spine = jg(abdomen,"spine",0,0.48,0);
  const spJoint = new THREE.Mesh(ball(0.14,12), mkJoint());
  addMesh(spine, spJoint, "spine");

  const chest = jg(spine,"chest",0,0.14,0);
  // Chest is a wider torso block
  const chestMesh = new THREE.Mesh(ellipsoid(0.32,0.40,0.22,14), mkWood());
  chestMesh.position.y = 0.42;
  addMesh(chest, chestMesh, "chest");

  // ── NECK ───────────────────────────────────────────────────────────────────
  const neck = jg(chest,"neck",0,0.95,0);
  const nkJoint = new THREE.Mesh(ball(0.12,12), mkJoint());
  addMesh(neck, nkJoint, "neck");
  const nkCyl = new THREE.Mesh(roundedCyl(0.095,0.11,0.22,10), mkWood());
  nkCyl.position.y = 0.11;
  addMesh(neck, nkCyl, "neck");

  // ── HEAD ───────────────────────────────────────────────────────────────────
  const head = jg(neck,"head",0,0.28,0);
  const headMesh = new THREE.Mesh(ellipsoid(0.38,0.44,0.34,18), mkWood());
  headMesh.position.y = 0.38;
  addMesh(head, headMesh, "head");

  // ── ARMS ───────────────────────────────────────────────────────────────────
  ["left","right"].forEach(side => {
    const sx = side==="left" ? -1 : 1;
    const zSz = side==="left" ? -PI/10 : PI/10; // slight natural angle

    // Shoulder ball
    const sh = jg(chest, `${side}Shoulder`, sx*0.40, 0.75, 0);
    const shBall = new THREE.Mesh(ball(0.13,14), mkJoint());
    addMesh(sh, shBall, `${side}Shoulder`);
    // Upper arm
    const uArm = new THREE.Mesh(roundedCyl(0.082,0.092,1.08,10), mkWood());
    uArm.position.y = -0.54;
    addMesh(sh, uArm, `${side}Shoulder`);

    // Elbow ball
    const el = jg(sh, `${side}Elbow`, 0,-1.08,0);
    const elBall = new THREE.Mesh(ball(0.088,12), mkJoint());
    addMesh(el, elBall, `${side}Elbow`);
    // Forearm
    const fArm = new THREE.Mesh(roundedCyl(0.072,0.082,0.90,10), mkWood());
    fArm.position.y = -0.45;
    addMesh(el, fArm, `${side}Elbow`);

    // Wrist ball
    const wr = jg(el, `${side}Wrist`, 0,-0.90,0);
    const wrBall = new THREE.Mesh(ball(0.072,12), mkJoint());
    addMesh(wr, wrBall, `${side}Wrist`);

    // Hand — like the photo: small rounded palm + fingers
    const palm = new THREE.Mesh(ellipsoid(0.075,0.10,0.048,10), mkWood());
    palm.position.y = -0.10;
    addMesh(wr, palm, `${side}Wrist`);
    // Finger bundle — two rounded pieces for index+middle
    const f1 = new THREE.Mesh(roundedCyl(0.02,0.025,0.10,8), mkWood());
    f1.position.set(sx*-0.018,-0.22,0.012);
    addMesh(wr, f1, null);
    const f2 = new THREE.Mesh(roundedCyl(0.018,0.022,0.10,8), mkWood());
    f2.position.set(sx*0.01,-0.22,-0.012);
    addMesh(wr, f2, null);
    const thumb = new THREE.Mesh(roundedCyl(0.018,0.022,0.07,8), mkWood());
    thumb.rotation.z = sx*-0.8;
    thumb.position.set(sx*0.068,-0.14,0.006);
    addMesh(wr, thumb, null);
  });

  // ── LEGS ───────────────────────────────────────────────────────────────────
  ["left","right"].forEach(side => {
    const sx = side==="left" ? -1 : 1;

    // Hip ball
    const hip = jg(hips, `${side}Hip`, sx*0.22,-0.28,0);
    const hipBall = new THREE.Mesh(ball(0.118,14), mkJoint());
    addMesh(hip, hipBall, `${side}Hip`);
    // Upper leg
    const uLeg = new THREE.Mesh(roundedCyl(0.108,0.118,1.55,12), mkWood());
    uLeg.position.y = -0.775;
    addMesh(hip, uLeg, `${side}Hip`);

    // Knee ball
    const kn = jg(hip, `${side}Knee`, 0,-1.55,0);
    const knBall = new THREE.Mesh(ball(0.11,12), mkJoint());
    addMesh(kn, knBall, `${side}Knee`);
    // Lower leg
    const lLeg = new THREE.Mesh(roundedCyl(0.085,0.105,1.38,12), mkWood());
    lLeg.position.y = -0.69;
    addMesh(kn, lLeg, `${side}Knee`);

    // Ankle ball
    const ak = jg(kn, `${side}Ankle`, 0,-1.38,0);
    const akBall = new THREE.Mesh(ball(0.082,12), mkJoint());
    addMesh(ak, akBall, `${side}Ankle`);

    // FOOT — rounded blob shape like the photo
    const foot = new THREE.Mesh(ellipsoid(0.115,0.075,0.21,14), mkWood());
    foot.position.set(0,-0.055,0.075);
    addMesh(ak, foot, `${side}Ankle`);
    // Ankle connector ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.082,0.018,8,16), mkJoint()
    );
    ring.rotation.x = PI/2; ring.position.y=-0.01;
    addMesh(ak, ring, null);
  });

  jointsRef.current  = jmap;
  bodyMeshesRef.current = meshes;
  m2jRef.current     = m2j;
}

// ═════════════════════════════════════════════════════════════════════════════
export default function PoseMaster() {
  const mountRef    = useRef(null);
  const sceneRef    = useRef(null);
  const rendRef     = useRef(null);
  const camRef      = useRef(null);
  const jointsRef   = useRef({});
  const bodyMRef    = useRef([]);
  const m2jRef      = useRef(new Map());
  const savedMRef   = useRef(new Map());
  const selNameRef  = useRef(null);
  const dragRef     = useRef({active:false,joint:false,right:false,lx:0,ly:0,sx:0,sy:0});
  const orbitRef    = useRef({theta:0.18,phi:1.15,r:11.5});
  const rafRef      = useRef(null);

  const [selName,  setSelName]  = useState(null);
  const [selRot,   setSelRot]   = useState({x:0,y:0,z:0});
  const [activeTab,setActiveTab]= useState("basic");
  const [msgs,     setMsgs]     = useState([{
    who:"b",
    html:"Hi! I know <b>combat</b>, <b>power</b> & <b>basic</b> poses.<br/>Try: <em>\"kamehameha\"</em>, <em>\"side kick\"</em>, <em>\"exhausted\"</em>, <em>\"charge up\"</em>…"
  }]);
  const [input, setInput] = useState("");

  // ── Camera update ──────────────────────────────────────────────────────────
  const updateCam = useCallback(() => {
    if (!camRef.current) return;
    const {theta,phi,r} = orbitRef.current;
    const tgt = new THREE.Vector3(0,4.5,0);
    camRef.current.position.set(
      tgt.x + r*Math.sin(phi)*Math.sin(theta),
      tgt.y + r*Math.cos(phi),
      tgt.z + r*Math.sin(phi)*Math.cos(theta)
    );
    camRef.current.lookAt(tgt);
  }, []);

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const w = mountRef.current.clientWidth;
    const h = mountRef.current.clientHeight;

    const renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.setSize(w,h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0C0C1A,1);
    mountRef.current.appendChild(renderer.domElement);
    rendRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Fog for depth
    scene.fog = new THREE.Fog(0x0C0C1A, 22, 40);

    const camera = new THREE.PerspectiveCamera(42, w/h, 0.1, 100);
    camRef.current = camera;
    updateCam();

    // Lights — warm studio lighting
    scene.add(new THREE.AmbientLight(0xFFF0DC, 0.52));
    const key = new THREE.DirectionalLight(0xFFF8EE, 1.1);
    key.position.set(5,13,7); key.castShadow=true;
    key.shadow.mapSize.set(2048,2048);
    key.shadow.camera.left=-7; key.shadow.camera.right=7;
    key.shadow.camera.top=15; key.shadow.camera.bottom=-3;
    key.shadow.bias = -0.0002;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xB8CCFF, 0.28);
    fill.position.set(-6,8,-5); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xFFD8A0, 0.20);
    rim.position.set(1,4,-10); scene.add(rim);
    const under = new THREE.DirectionalLight(0xE0C880, 0.08);
    under.position.set(0,-5,2); scene.add(under);

    // Floor — wooden desk feel
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(18,18),
      new THREE.MeshLambertMaterial({color:0x1A1428})
    );
    floor.rotation.x = -PI/2; floor.receiveShadow=true;
    scene.add(floor);
    scene.add(new THREE.GridHelper(16,20, 0x1E1A30, 0x18142A));

    buildMannequin(scene, jointsRef, bodyMRef, m2jRef);
    applyPose("neutral");

    const loop = () => { rafRef.current=requestAnimationFrame(loop); renderer.render(scene,camera); };
    loop();

    const onResize = () => {
      if (!mountRef.current) return;
      const w2=mountRef.current.clientWidth, h2=mountRef.current.clientHeight;
      renderer.setSize(w2,h2);
      camera.aspect=w2/h2; camera.updateProjectionMatrix();
    };
    window.addEventListener("resize",onResize);
    return () => {
      window.removeEventListener("resize",onResize);
      cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      if (mountRef.current?.contains(renderer.domElement))
        mountRef.current.removeChild(renderer.domElement);
    };
  }, []);

  // ── Pose ───────────────────────────────────────────────────────────────────
  const applyPose = useCallback((name) => {
    const pd = POSE_DEFS[name]; if (!pd) return;
    const js = jointsRef.current;
    Object.keys(js).forEach(n => js[n].rotation.set(0,0,0));
    Object.keys(pd.j||{}).forEach(n => {
      if (!js[n]) return;
      const r=pd.j[n];
      js[n].rotation.x=r.x||0; js[n].rotation.y=r.y||0; js[n].rotation.z=r.z||0;
    });
    if (selNameRef.current) {
      const j=js[selNameRef.current];
      if (j) setSelRot({x:j.rotation.x,y:j.rotation.y,z:j.rotation.z});
    }
  }, []);

  // ── Highlight ──────────────────────────────────────────────────────────────
  const highlight = useCallback((name) => {
    savedMRef.current.forEach((m,mesh)=>{mesh.material=m;});
    savedMRef.current.clear();
    if (!name||!jointsRef.current[name]) return;
    jointsRef.current[name].children.forEach(c=>{
      if(c.isMesh){savedMRef.current.set(c,c.material);c.material=mkSel();}
    });
  },[]);

  const selectJoint = useCallback((name)=>{
    selNameRef.current=name; highlight(name); setSelName(name);
    const j=jointsRef.current[name];
    if(j) setSelRot({x:j.rotation.x,y:j.rotation.y,z:j.rotation.z});
  },[highlight]);

  const deselect = useCallback(()=>{
    selNameRef.current=null; highlight(null); setSelName(null);
  },[highlight]);

  const refreshRot = useCallback(()=>{
    const j=jointsRef.current[selNameRef.current];
    if(j) setSelRot({x:j.rotation.x,y:j.rotation.y,z:j.rotation.z});
  },[]);

  // ── Pointer ────────────────────────────────────────────────────────────────
  const getXY = e => e.touches?{x:e.touches[0].clientX,y:e.touches[0].clientY}:{x:e.clientX,y:e.clientY};

  const onDown = useCallback((e)=>{
    const {x,y}=getXY(e);
    const d=dragRef.current;
    d.active=true; d.lx=x; d.ly=y; d.sx=x; d.sy=y;
    d.right=(e.button===2);
    if(!d.right){
      const rect=mountRef.current.getBoundingClientRect();
      const ndc=new THREE.Vector2(((x-rect.left)/rect.width)*2-1,-((y-rect.top)/rect.height)*2+1);
      const ray=new THREE.Raycaster();
      ray.setFromCamera(ndc,camRef.current);
      const hits=ray.intersectObjects(bodyMRef.current,false);
      if(hits.length){
        const jn=m2jRef.current.get(hits[0].object);
        if(jn){selectJoint(jn);d.joint=true;e.preventDefault();return;}
      }
    }
    d.joint=false;
  },[selectJoint]);

  const onMove = useCallback((e)=>{
    const d=dragRef.current; if(!d.active)return;
    const {x,y}=getXY(e);
    const dx=x-d.lx, dy=y-d.ly;
    d.lx=x; d.ly=y;
    if(!d.right&&d.joint&&selNameRef.current){
      const j=jointsRef.current[selNameRef.current];
      if(j){j.rotation.y+=dx*.013;j.rotation.x+=dy*.013;refreshRot();}
      e.preventDefault();
    } else {
      const o=orbitRef.current;
      o.theta+=dx*.007;
      o.phi=Math.max(.04,Math.min(PI-.04,o.phi-dy*.007));
      updateCam();
    }
  },[refreshRot,updateCam]);

  const onUp = useCallback((e)=>{
    const d=dragRef.current; if(!d.active)return;
    const pos=e.changedTouches?{x:e.changedTouches[0].clientX,y:e.changedTouches[0].clientY}:{x:e.clientX,y:e.clientY};
    if(!d.joint&&!d.right&&Math.abs(pos.x-d.sx)+Math.abs(pos.y-d.sy)<5)deselect();
    d.active=false;d.joint=false;d.right=false;
  },[deselect]);

  useEffect(()=>{
    const el=mountRef.current; if(!el)return;
    const wh=(e)=>{e.preventDefault();const o=orbitRef.current;o.r=Math.max(3,Math.min(19,o.r+e.deltaY*.012));updateCam();};
    el.addEventListener("wheel",wh,{passive:false});
    return()=>el.removeEventListener("wheel",wh);
  },[updateCam]);

  useEffect(()=>{
    const ok=(e)=>{
      if(e.key==="Escape"){deselect();return;}
      if(!selNameRef.current)return;
      if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key))return;
      e.preventDefault();
      const j=jointsRef.current[selNameRef.current]; if(!j)return;
      const s=PI/40;
      if(e.key==="ArrowLeft") j.rotation.y-=s;
      if(e.key==="ArrowRight")j.rotation.y+=s;
      if(e.key==="ArrowUp")   j.rotation.x-=s;
      if(e.key==="ArrowDown") j.rotation.x+=s;
      refreshRot();
    };
    window.addEventListener("keydown",ok);
    return()=>window.removeEventListener("keydown",ok);
  },[deselect,refreshRot]);

  // ── Chat ───────────────────────────────────────────────────────────────────
  const send = useCallback(()=>{
    const t=input.trim(); if(!t)return;
    setInput(""); setMsgs(m=>[...m,{who:"u",html:t}]);
    let reply="";
    for(const[re,pn]of BOT_RULES){
      if(re.test(t)){
        applyPose(pn);
        reply=`Done! Applied <em>${POSE_DEFS[pn]?.label}</em> pose.`;
        break;
      }
    }
    if(!reply){
      for(const[re,fn]of JOINT_RULES){
        if(re.test(t)){fn(jointsRef.current);refreshRot();reply="Done, adjusted the joint!";break;}
      }
    }
    if(!reply){
      const all=Object.values(POSE_DEFS).map(p=>`<em>${p.label}</em>`).join(", ");
      reply=`Didn't get that. Try: <em>"side kick"</em>, <em>"charge up"</em>, <em>"exhausted"</em>…<br/><small>All: ${all}</small>`;
    }
    setTimeout(()=>setMsgs(m=>[...m,{who:"b",html:reply}]),160);
  },[input,applyPose,refreshRot]);

  const quickPose = useCallback((name)=>{
    applyPose(name);
    setMsgs(m=>[...m,{who:"b",html:`Applied <em>${POSE_DEFS[name]?.label}</em>`}]);
  },[applyPose]);

  const d2=v=>Math.round(v*180/PI)+"°";
  const tabPoses=Object.entries(POSE_DEFS).filter(([,v])=>v.cat===activeTab);

  // ─────────────────────────────────────────────────────────────────────────
  const [mobileTab, setMobileTab] = useState("poses");

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",
      background:"#0C0C1A",fontFamily:"'DM Mono',monospace",overflow:"hidden"}}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@300;400;500&display=swap');
        @keyframes pm-pulse{0%,100%{opacity:1;}50%{opacity:.35;}}
        em{color:#E4E4F0;font-style:normal;}
        b{color:#E8884A;font-weight:500;}
        small{font-size:9px;}
        *{box-sizing:border-box;}
        *::-webkit-scrollbar{width:3px;}
        *::-webkit-scrollbar-thumb{background:#20203A;border-radius:2px;}
        .pb:active{transform:scale(.95);background:#1A1830!important;}
        .tb-btn:active{background:#1A1830;}

        /* ── DESKTOP ── */
        @media(min-width:700px){
          #pm-layout{flex-direction:row!important;}
          #pm-header{display:none!important;}
          #pm-canvas{flex:1!important;height:100vh!important;}
          #pm-sidebar{
            width:280px!important;min-width:280px!important;
            height:100vh!important;border-top:none!important;
            border-left:1px solid #20203A!important;
            flex-direction:column!important;
          }
          #pm-mobnav{display:none!important;}
          #pm-poses{display:flex!important;flex:1!important;}
          #pm-chat{display:flex!important;flex:1!important;}
          #pm-deskhead{display:block!important;}
        }

        /* ── MOBILE ── */
        @media(max-width:699px){
          #pm-canvas{height:52vh!important;}
          #pm-sidebar{height:48vh!important;}
          #pm-deskhead{display:none!important;}
        }
      `}</style>

      {/* ── MOBILE HEADER ── */}
      <div id="pm-header" style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"8px 14px",background:"#0F0E1F",borderBottom:"1px solid #20203A",flexShrink:0}}>
        <div>
          <div style={{fontFamily:"'Syne',sans-serif",fontSize:18,fontWeight:800,letterSpacing:-.5,color:"#E4E4F0",lineHeight:1}}>
            Pose<span style={{color:"#E8884A"}}>Master</span>
          </div>
          <div style={{fontSize:8,color:"#4A4A72",letterSpacing:1.2,textTransform:"uppercase"}}>Artist 3D Mannequin</div>
        </div>
        {selName && (
          <div style={{background:"rgba(232,136,74,.12)",border:"1px solid #E8884A",
            borderRadius:8,padding:"4px 9px",fontSize:9,color:"#E8884A",textAlign:"right"}}>
            {selName.replace("left","L ").replace("right","R ").replace(/([A-Z])/g," $1").trim().toUpperCase()}
            <div style={{display:"flex",gap:6,marginTop:1,justifyContent:"flex-end"}}>
              {["x","y","z"].map(ax=>(
                <span key={ax} style={{color:"#5A5A88",fontSize:8}}>{ax.toUpperCase()}:{d2(selRot[ax])}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── MAIN LAYOUT ── */}
      <div id="pm-layout" style={{display:"flex",flex:1,overflow:"hidden",flexDirection:"column",minHeight:0}}>

        {/* ── 3D CANVAS ── */}
        <div id="pm-canvas" style={{position:"relative",overflow:"hidden",flexShrink:0}}
          ref={mountRef}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
          onContextMenu={e=>e.preventDefault()}
        >
          {/* Desktop joint HUD */}
          {selName && (
            <div style={{position:"absolute",top:12,left:12,background:"rgba(12,12,26,0.92)",
              border:"1px solid #22203A",borderRadius:9,padding:"8px 12px",fontSize:11,
              backdropFilter:"blur(14px)",pointerEvents:"none"}}>
              <div style={{color:"#E8884A",fontSize:11,fontWeight:600,marginBottom:3}}>
                {selName.replace("left","L ").replace("right","R ").replace(/([A-Z])/g," $1").trim().toUpperCase()}
              </div>
              <div style={{display:"flex",gap:12}}>
                {["x","y","z"].map(ax=>(
                  <span key={ax} style={{color:"#5A5A88",fontSize:10}}>
                    {ax.toUpperCase()}: <span style={{color:"#E4E4F0"}}>{d2(selRot[ax])}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Toolbar */}
          <div style={{position:"absolute",bottom:12,left:"50%",transform:"translateX(-50%)",
            display:"flex",gap:5,background:"rgba(12,12,26,.94)",
            border:"1px solid #22203A",borderRadius:28,padding:"6px 12px"}}>
            {[
              ["↺ Reset",()=>{applyPose("neutral");setMsgs(m=>[...m,{who:"b",html:"Reset."}]);}],
              ["⊕ Cam",()=>{orbitRef.current={theta:0.18,phi:1.15,r:11.5};updateCam();}],
              ["⬡ Shot",()=>{rendRef.current.render(sceneRef.current,camRef.current);const a=document.createElement("a");a.href=rendRef.current.domElement.toDataURL("image/png");a.download="pose.png";a.click();}],
            ].map(([lbl,fn])=>(
              <button key={lbl} className="tb-btn" onClick={fn} style={{
                background:"none",border:"1px solid #22203A",color:"#5A5A88",
                padding:"6px 12px",borderRadius:16,cursor:"pointer",
                fontFamily:"'DM Mono',monospace",fontSize:10,transition:"all .14s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="#E8884A";e.currentTarget.style.color="#E4E4F0";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="#22203A";e.currentTarget.style.color="#5A5A88";}}
              >{lbl}</button>
            ))}
          </div>
        </div>

        {/* ── SIDEBAR / BOTTOM PANEL ── */}
        <div id="pm-sidebar" style={{background:"#0F0E1F",borderTop:"1px solid #20203A",
          display:"flex",flexDirection:"column",overflow:"hidden",flexShrink:0}}>

          {/* Desktop header (hidden on mobile) */}
          <div id="pm-deskhead" style={{padding:"14px 14px 10px",borderBottom:"1px solid #20203A",flexShrink:0}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:800,letterSpacing:-.5,color:"#E4E4F0"}}>
              Pose<span style={{color:"#E8884A"}}>Master</span>
            </div>
            <div style={{fontSize:8,color:"#4A4A72",letterSpacing:1.4,textTransform:"uppercase",marginTop:1}}>
              Artist's 3D Mannequin
            </div>
          </div>

          {/* Mobile nav: Poses | Bot */}
          <div id="pm-mobnav" style={{display:"flex",borderBottom:"1px solid #20203A",flexShrink:0}}>
            {[["poses","Poses"],["chat","Bot"]].map(([id,lbl])=>(
              <button key={id} onClick={()=>setMobileTab(id)} style={{
                flex:1,background:"none",border:"none",
                borderBottom:mobileTab===id?"2px solid #E8884A":"2px solid transparent",
                color:mobileTab===id?"#E8884A":"#4A4A72",
                padding:"9px 4px",fontSize:12,cursor:"pointer",
                fontFamily:"'DM Mono',monospace",letterSpacing:.5,
                textTransform:"uppercase",transition:"all .14s"}}>
                {lbl}
              </button>
            ))}
          </div>

          {/* POSES */}
          <div id="pm-poses" style={{display:mobileTab==="poses"?"flex":"none",flexDirection:"column",overflow:"hidden",flex:1}}>
            {/* Category tabs */}
            <div style={{display:"flex",borderBottom:"1px solid #20203A",flexShrink:0}}>
              {["basic","combat","power"].map(tab=>(
                <button key={tab} onClick={()=>setActiveTab(tab)} style={{
                  flex:1,background:"none",border:"none",
                  borderBottom:activeTab===tab?`2px solid ${CAT_CLR[tab]}`:"2px solid transparent",
                  color:activeTab===tab?CAT_CLR[tab]:"#4A4A72",
                  padding:"8px 4px",fontSize:10,cursor:"pointer",
                  fontFamily:"'DM Mono',monospace",letterSpacing:.7,
                  textTransform:"uppercase",transition:"all .14s"}}>
                  {tab}
                </button>
              ))}
            </div>
            {/* Grid */}
            <div style={{flex:1,overflowY:"auto",padding:"8px 8px",scrollbarWidth:"thin"}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                {tabPoses.map(([name,info])=>(
                  <button key={name} className="pb" onClick={()=>quickPose(name)} style={{
                    background:"#131220",border:"1px solid #20203A",
                    color:"#5A5A88",padding:"10px 4px",borderRadius:9,
                    cursor:"pointer",fontFamily:"'DM Mono',monospace",
                    fontSize:11,textAlign:"center",transition:"all .13s",
                    lineHeight:1.3,minHeight:42}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=CAT_CLR[activeTab];e.currentTarget.style.color=CAT_CLR[activeTab];e.currentTarget.style.background=`${CAT_CLR[activeTab]}18`;}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor="#20203A";e.currentTarget.style.color="#5A5A88";e.currentTarget.style.background="#131220";}}
                  >{info.label}</button>
                ))}
              </div>
            </div>
          </div>

          {/* CHAT */}
          <div id="pm-chat" style={{display:mobileTab==="chat"?"flex":"none",flexDirection:"column",flex:1,overflow:"hidden"}}>
            <div style={{flex:1,overflowY:"auto",padding:"9px",display:"flex",
              flexDirection:"column",gap:7,scrollbarWidth:"thin"}}
              ref={el=>{if(el)el.scrollTop=el.scrollHeight;}}>
              {msgs.map((msg,i)=>(
                <div key={i} style={{alignSelf:msg.who==="u"?"flex-end":"flex-start",
                  maxWidth:"92%",padding:"9px 12px",borderRadius:11,fontSize:12,
                  lineHeight:1.5,background:msg.who==="u"?"#17162A":"#0F0E1E",
                  border:"1px solid #1E1D32",color:msg.who==="u"?"#E4E4F0":"#8080A8"}}>
                  {msg.who==="b"&&<div style={{fontSize:9,color:"#E8884A",fontWeight:600,marginBottom:3}}>POSE BOT</div>}
                  <span dangerouslySetInnerHTML={{__html:msg.html}}/>
                </div>
              ))}
            </div>
            <div style={{padding:"8px 9px",borderTop:"1px solid #20203A",display:"flex",gap:7,flexShrink:0}}>
              <input value={input} onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter")send();}}
                placeholder="describe a pose…" maxLength={200}
                style={{flex:1,background:"#131220",border:"1px solid #20203A",
                  color:"#E4E4F0",padding:"10px 13px",borderRadius:20,
                  fontFamily:"'DM Mono',monospace",fontSize:12,outline:"none"}}
              />
              <button onClick={send} style={{background:"#E8884A",border:"none",color:"#fff",
                padding:"10px 16px",borderRadius:20,cursor:"pointer",fontSize:15}}>→</button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
