/**
 * `hat.*` - the cosmetic roster the lobby wardrobe sells.
 *
 * Each one is an ordinary shared-art builder. Logic buys and equips a hat by
 * id (`config/player.json -> customisation.hats`), builds it exactly the way it
 * builds a door, and parents the result to the player's `hatAnchor`. It has no
 * required parts and no collider, which is the whole contract: a hat is
 * scenery riding a head.
 *
 * COORDINATES. The anchor sits on the crown of the helmet, so a hat is authored
 * with its origin THERE, facing -Z, with the head's centre at `HEAD` below it.
 * Anything meant to wrap the head therefore hangs BELOW y = 0, and anything
 * stacked on top rises above it. Nothing may reach further than about 0.42 m
 * out, or a hat clips a doorway its owner walks through.
 *
 * Materials come from `hatMaterials()` rather than from the pack - see the note
 * at the top of that file. Idle motion (a spinning propeller, a guttering
 * flame) is the art's own business and is driven from `onBeforeRender`, like
 * every other idle motion in the project.
 */
import * as THREE from 'three';
import type { ArtRegistry, BuiltArt } from '../../lib/contract';
import { hatMaterials } from './hatMaterials';

/** The head's centre, in hat space. The crown - and the anchor - is at y = 0. */
const HEAD = -0.19;

/* --- scaffolding -------------------------------------------------------------- */

interface Kit {
  object: THREE.Group;
  /** Adds a mesh in the named material and returns it, so callers can pose it. */
  add(geometry: THREE.BufferGeometry, material: string, position?: readonly [number, number, number]): THREE.Mesh;
  group(position?: readonly [number, number, number]): THREE.Group;
  done(onFrame?: (t: number) => void, driver?: THREE.Mesh): BuiltArt;
}

function kit(): Kit {
  const object = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials = hatMaterials();
  let last: THREE.Mesh | null = null;

  const add: Kit['add'] = (geometry, material, position = [0, 0, 0]) => {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, materials.get(material));
    mesh.position.set(position[0], position[1], position[2]);
    object.add(mesh);
    last = mesh;
    return mesh;
  };

  return {
    object,
    add,
    group(position = [0, 0, 0]) {
      const g = new THREE.Group();
      g.position.set(position[0], position[1], position[2]);
      object.add(g);
      return g;
    },
    /**
     * `onFrame` is hung on a MESH, because `Object3D.onBeforeRender` only fires
     * for things that are actually drawn - the same reason the ghost's bob is
     * hung on its robe.
     */
    done(onFrame, driver) {
      const target = driver ?? last;
      if (onFrame && target) {
        const clock = new THREE.Clock();
        let t = 0;
        target.onBeforeRender = () => {
          t += clock.getDelta();
          onFrame(t);
        };
      }
      return {
        object,
        colliders: [],
        parts: {},
        dispose(): void {
          for (const geometry of geometries) geometry.dispose();
        },
      };
    },
  };
}

/** A cap that hugs the helmet: a sphere centred on the head, cut off at `sweep`. */
function skullCap(radius: number, sweep: number): THREE.SphereGeometry {
  return new THREE.SphereGeometry(radius, 22, 14, 0, Math.PI * 2, 0, sweep);
}

/**
 * A brim, as a swept cross-section: a solid ring with a hole for the head in
 * the middle. `rise` lifts the outer edge, which is the difference between a
 * cowboy hat and a plate.
 */
function brim(inner: number, outer: number, thickness: number, rise: number): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    [
      new THREE.Vector2(inner, 0),
      new THREE.Vector2(outer, rise),
      new THREE.Vector2(outer, rise + thickness),
      new THREE.Vector2(inner, thickness),
      new THREE.Vector2(inner, 0),
    ],
    30,
  );
}

/** A half-disc lying flat, sticking out toward -Z. Peaks and visors. */
function peak(radius: number, thickness: number): THREE.CylinderGeometry {
  return new THREE.CylinderGeometry(radius, radius, thickness, 20, 1, false, 0, Math.PI);
}

/* --- the roster --------------------------------------------------------------- */

/** Tweed flat cap. The one a person might actually own. */
function buildFlatCap(): BuiltArt {
  const k = kit();

  const crown = k.add(skullCap(0.216, 1.2), 'tweed', [0, HEAD + 0.03, 0.014]);
  crown.scale.set(1.06, 1.05, 1.14);

  const bill = k.add(peak(0.215, 0.024), 'feltBrown', [0, -0.05, -0.06]);
  bill.rotation.set(0.2, Math.PI / 2, 0);
  bill.scale.set(0.8, 1, 1);

  // The seam that folds the crown down over the peak - the whole point of a
  // flat cap is that the two are one piece.
  const fold = k.add(new THREE.TorusGeometry(0.185, 0.026, 8, 24, Math.PI), 'tweed', [0, -0.05, -0.03]);
  fold.rotation.set(Math.PI / 2, 0, 0);

  k.add(new THREE.SphereGeometry(0.022, 10, 8), 'feltBrown', [0, 0.008, 0.012]);
  return k.done();
}

/** Black silk top hat, band and buckle. Formal enough to be funny in a cellar. */
function buildTopHat(): BuiltArt {
  const k = kit();

  k.add(brim(0.19, 0.3, 0.02, -0.022), 'felt', [0, -0.06, 0]);
  k.add(new THREE.CylinderGeometry(0.188, 0.202, 0.3, 26, 1, true), 'felt', [0, 0.09, 0]);
  k.add(new THREE.CircleGeometry(0.188, 26), 'felt', [0, 0.24, 0]).rotation.x = -Math.PI / 2;
  k.add(new THREE.CylinderGeometry(0.207, 0.207, 0.062, 26), 'silk', [0, -0.008, 0]);
  k.add(new THREE.BoxGeometry(0.07, 0.05, 0.02), 'gold', [0, -0.008, -0.202]);
  return k.done();
}

/** Site helmet: shell, comb, peak and a strip of reflective tape. */
function buildHardHat(): BuiltArt {
  const k = kit();

  const shell = k.add(skullCap(0.218, 1.32), 'safety', [0, HEAD + 0.02, 0.01]);
  shell.scale.set(1, 1.18, 1.1);

  // The comb down the middle, which is the single detail that says "helmet".
  const comb = k.add(new THREE.TorusGeometry(0.2, 0.019, 8, 22, Math.PI), 'safety', [0, HEAD + 0.02, 0.01]);
  comb.rotation.y = Math.PI / 2;
  comb.scale.set(1.06, 1.2, 1);

  k.add(brim(0.2, 0.243, 0.018, -0.008), 'safety', [0, -0.085, 0.01]);
  const bill = k.add(peak(0.235, 0.02), 'safety', [0, -0.082, -0.03]);
  bill.rotation.set(0.1, Math.PI / 2, 0);
  bill.scale.set(0.62, 1, 1);

  k.add(new THREE.BoxGeometry(0.16, 0.03, 0.012), 'reflective', [0, -0.03, -0.196]);
  for (const side of [-1, 1]) {
    k.add(new THREE.BoxGeometry(0.014, 0.026, 0.09), 'reflective', [side * 0.2, -0.04, 0.02]);
  }
  return k.done();
}

/** Knitted beanie with a rolled brim and a pom-pom. */
function buildBeanie(): BuiltArt {
  const k = kit();

  const cap = k.add(skullCap(0.212, 1.62), 'wool', [0, HEAD, 0]);
  cap.scale.set(1, 1.06, 1);

  const roll = k.add(new THREE.TorusGeometry(0.196, 0.042, 10, 26), 'woolPale', [0, HEAD - 0.045, 0]);
  roll.rotation.x = Math.PI / 2;

  k.add(new THREE.SphereGeometry(0.062, 14, 12), 'woolPale', [0, 0.06, 0]);
  k.add(new THREE.CylinderGeometry(0.022, 0.03, 0.05, 10), 'wool', [0, 0.015, 0]);
  return k.done();
}

/** Wide brim, upturned at the sides, band and buckle. */
function buildCowboy(): BuiltArt {
  const k = kit();

  const crown = new THREE.LatheGeometry(
    [
      [0.0, 0.2],
      [0.075, 0.196],
      [0.13, 0.166],
      [0.172, 0.09],
      [0.198, -0.01],
      [0.212, -0.075],
    ].map(([r, y]) => new THREE.Vector2(r ?? 0, y ?? 0)),
    26,
  );
  k.add(crown, 'feltBrown');

  // The pinch down the middle of the crown, in two dents rather than a crease -
  // a crease means reshaping the lathe, and nobody will look that closely.
  for (const side of [-1, 1]) {
    const dent = k.add(new THREE.SphereGeometry(0.075, 12, 10), 'feltBrown', [side * 0.085, 0.185, 0]);
    dent.scale.set(0.8, 0.4, 1.5);
  }

  k.add(brim(0.2, 0.4, 0.02, 0.055), 'feltBrown', [0, -0.09, 0]);
  k.add(new THREE.CylinderGeometry(0.208, 0.216, 0.05, 26), 'leather', [0, -0.048, 0]);
  k.add(new THREE.BoxGeometry(0.05, 0.042, 0.018), 'gold', [0, -0.048, -0.212]);
  return k.done();
}

/** Leather cap with a brass lamp on the front. It lights nothing - it glows. */
function buildMinersLamp(): BuiltArt {
  const k = kit();

  const cap = k.add(skullCap(0.21, 1.4), 'leather', [0, HEAD, 0]);
  cap.scale.set(1, 0.95, 1.04);

  const band = k.add(new THREE.TorusGeometry(0.198, 0.024, 8, 26), 'feltBrown', [0, HEAD + 0.038, 0]);
  band.rotation.x = Math.PI / 2;

  const housing = k.add(new THREE.CylinderGeometry(0.055, 0.062, 0.075, 16), 'brass', [0, -0.025, -0.175]);
  housing.rotation.x = Math.PI / 2;

  const bezel = k.add(new THREE.TorusGeometry(0.058, 0.012, 8, 20), 'brass', [0, -0.025, -0.212]);
  bezel.rotation.x = 0;

  const lens = k.add(new THREE.CircleGeometry(0.052, 18), 'lamp', [0, -0.025, -0.215]);
  lens.rotation.y = Math.PI;

  // There is no beam. A translucent cone in front of the lens read as a dark
  // flag rather than as light, and the game has no player flashlight to imply
  // in the first place (docs/ARCHITECTURE.md, "Deliberately NOT built") - the
  // lit lens says the lamp is on and stops there.
  return k.done();
}

/** Gold circlet, eight points, six stones. Nobody asked why you have it. */
function buildCrown(): BuiltArt {
  const k = kit();

  const lining = k.add(skullCap(0.204, 1.15), 'fabricRed', [0, HEAD, 0]);
  lining.scale.set(1, 0.98, 1);

  k.add(new THREE.CylinderGeometry(0.216, 0.222, 0.095, 26), 'gold', [0, -0.075, 0]);

  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const point = k.add(new THREE.ConeGeometry(0.036, 0.115, 8), 'gold', [
      Math.sin(angle) * 0.203,
      0,
      Math.cos(angle) * 0.203,
    ]);
    // Tipped outward, so the crown opens rather than standing like a fence.
    point.rotation.z = -Math.sin(angle) * 0.16;
    point.rotation.x = Math.cos(angle) * 0.16;
  }

  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + 0.25;
    const gem = k.add(new THREE.OctahedronGeometry(0.032), 'gem', [
      Math.sin(angle) * 0.222,
      -0.072,
      Math.cos(angle) * 0.222,
    ]);
    gem.scale.set(0.7, 1, 0.7);
    gem.rotation.y = angle;
  }
  return k.done();
}

/** Folded newspaper. Four panels pinched to a ridge, and a turned-up brim. */
function buildPaperBoat(): BuiltArt {
  const k = kit();

  const body = k.add(new THREE.ConeGeometry(0.27, 0.4, 4, 1, true), 'paper', [0, 0.09, 0]);
  body.rotation.y = Math.PI / 4;
  body.scale.set(0.4, 1, 1.05);

  k.add(brim(0.185, 0.235, 0.026, 0.03), 'paper', [0, -0.115, 0]);

  // The two turned-up flaps, front and back, that stop it reading as a cone.
  for (const side of [-1, 1]) {
    const flap = k.add(new THREE.BoxGeometry(0.12, 0.085, 0.014), 'paper', [0, -0.055, side * 0.235]);
    flap.rotation.x = side * 0.35;
  }
  return k.done();
}

/** A traffic cone. On your head. With the base plate still attached. */
function buildTrafficCone(): BuiltArt {
  const k = kit();

  k.add(new THREE.BoxGeometry(0.4, 0.032, 0.4), 'cone', [0, -0.1, 0]);
  k.add(new THREE.ConeGeometry(0.185, 0.42, 22, 1, true), 'cone', [0, 0.13, 0]);

  for (const [y, radius] of [
    [0.06, 0.126],
    [0.16, 0.082],
  ] as const) {
    k.add(new THREE.ConeGeometry(radius + 0.006, 0.075, 22, 1, true), 'reflective', [0, y, 0]);
  }
  return k.done();
}

/** A rubber duck, sitting on you, saying nothing. */
function buildRubberDuck(): BuiltArt {
  const k = kit();

  const body = k.add(new THREE.SphereGeometry(0.128, 18, 14), 'duck', [0, 0.075, 0.012]);
  body.scale.set(1, 0.92, 1.22);

  k.add(new THREE.SphereGeometry(0.082, 16, 12), 'duck', [0, 0.205, -0.088]);

  const beak = k.add(new THREE.ConeGeometry(0.042, 0.082, 12), 'beak', [0, 0.195, -0.16]);
  beak.rotation.x = -Math.PI / 2;

  for (const side of [-1, 1]) {
    k.add(new THREE.SphereGeometry(0.016, 8, 8), 'eye', [side * 0.04, 0.232, -0.145]);
  }

  const tail = k.add(new THREE.ConeGeometry(0.055, 0.1, 10), 'duck', [0, 0.115, 0.155]);
  tail.rotation.x = -0.9;

  // Wings, so it has a silhouette from the side as well as the front.
  for (const side of [-1, 1]) {
    const wing = k.add(new THREE.SphereGeometry(0.07, 12, 10), 'duck', [side * 0.105, 0.075, 0.02]);
    wing.scale.set(0.35, 0.8, 1.1);
  }
  return k.done();
}

/** A cupcake with a lit candle. The flame gutters; nothing else moves. */
function buildBirthdayCake(): BuiltArt {
  const k = kit();

  k.add(new THREE.CylinderGeometry(0.16, 0.115, 0.115, 18), 'fabricBlue', [0, -0.03, 0]);
  k.add(new THREE.CylinderGeometry(0.158, 0.158, 0.03, 18), 'sponge', [0, 0.04, 0]);

  for (const [y, radius, tube] of [
    [0.075, 0.115, 0.048],
    [0.135, 0.083, 0.043],
    [0.185, 0.048, 0.037],
  ] as const) {
    const swirl = k.add(new THREE.TorusGeometry(radius, tube, 10, 22), 'frosting', [0, y, 0]);
    swirl.rotation.x = Math.PI / 2;
  }
  k.add(new THREE.SphereGeometry(0.045, 12, 10), 'frosting', [0, 0.215, 0]);

  for (const [x, z, material] of [
    [0.09, 0.05, 'gem'],
    [-0.07, 0.09, 'safety'],
    [0.02, -0.11, 'antennaGlow'],
    [-0.1, -0.04, 'fabricRed'],
  ] as const) {
    const sprinkle = k.add(new THREE.BoxGeometry(0.014, 0.014, 0.038), material, [x, 0.105, z]);
    sprinkle.rotation.set(0.5, x * 8, 0.4);
  }

  k.add(new THREE.CylinderGeometry(0.016, 0.018, 0.11, 10), 'wax', [0, 0.29, 0]);
  const flame = k.add(new THREE.SphereGeometry(0.028, 10, 10), 'flame', [0, 0.365, 0]);
  flame.scale.set(0.75, 1.6, 0.75);

  return k.done((t) => {
    flame.scale.set(0.72 + Math.sin(t * 11) * 0.06, 1.5 + Math.sin(t * 7.3) * 0.22, 0.72 + Math.cos(t * 9) * 0.06);
    flame.position.x = Math.sin(t * 5.5) * 0.006;
  }, flame);
}

/** Propeller beanie. Four panels, and it turns. */
function buildPropeller(): BuiltArt {
  const k = kit();

  for (let i = 0; i < 4; i++) {
    const quarter = new THREE.SphereGeometry(0.208, 8, 12, (i / 4) * Math.PI * 2, Math.PI / 2, 0, 1.45);
    k.add(quarter, i % 2 === 0 ? 'fabricRed' : 'fabricBlue', [0, HEAD, 0]);
  }

  const rim = k.add(new THREE.TorusGeometry(0.2, 0.022, 8, 26), 'woolPale', [0, HEAD + 0.028, 0]);
  rim.rotation.x = Math.PI / 2;

  k.add(new THREE.CylinderGeometry(0.016, 0.02, 0.055, 10), 'steel', [0, 0.035, 0]);

  const rotor = k.group([0, 0.068, 0]);
  for (const [i, material] of ['fabricRed', 'fabricBlue'].entries()) {
    const blade = k.add(new THREE.BoxGeometry(0.21, 0.01, 0.042), material, [0, 0, 0]);
    blade.rotation.y = i * Math.PI;
    blade.rotation.z = 0.25;
    blade.position.set(Math.cos(i * Math.PI) * 0.1, 0, 0);
    rotor.add(blade);
  }
  const hub = k.add(new THREE.SphereGeometry(0.024, 10, 8), 'steel', [0, 0.068, 0]);

  return k.done((t) => {
    rotor.rotation.y = t * 5.5;
  }, hub);
}

/** A halo. Turns slowly, drifts, and is entirely unearned. */
function buildHalo(): BuiltArt {
  const k = kit();

  const ring = k.group([0, 0.215, 0]);
  const inner = k.add(new THREE.TorusGeometry(0.175, 0.02, 10, 30), 'halo');
  inner.rotation.x = Math.PI / 2;
  ring.add(inner);

  const bloom = k.add(new THREE.TorusGeometry(0.178, 0.05, 8, 26), 'haloSoft');
  bloom.rotation.x = Math.PI / 2;
  ring.add(bloom);

  const motes: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const mote = k.add(new THREE.SphereGeometry(0.016, 8, 6), 'halo', [
      Math.sin(angle) * 0.175,
      0,
      Math.cos(angle) * 0.175,
    ]);
    ring.add(mote);
    motes.push(mote);
  }

  return k.done((t) => {
    ring.rotation.y = t * 0.9;
    ring.position.y = 0.215 + Math.sin(t * 1.4) * 0.018;
    for (const [i, mote] of motes.entries()) {
      mote.position.y = Math.sin(t * 2.2 + i) * 0.02;
    }
  }, inner);
}

/** Two antennae with glowing bulbs, bobbing on their own springs. */
function buildAntennae(): BuiltArt {
  const k = kit();

  const band = k.add(new THREE.TorusGeometry(0.196, 0.026, 8, 26), 'felt', [0, -0.06, 0]);
  band.rotation.x = Math.PI / 2;

  const bulbs: { mesh: THREE.Mesh; side: number }[] = [];
  for (const side of [-1, 1]) {
    const stalk = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.075, -0.02, 0),
        new THREE.Vector3(side * 0.115, 0.09, -0.01),
        new THREE.Vector3(side * 0.16, 0.19, -0.02),
      ]),
      14,
      0.012,
      8,
      false,
    );
    k.add(stalk, 'felt');
    bulbs.push({
      mesh: k.add(new THREE.SphereGeometry(0.042, 14, 12), 'antennaGlow', [side * 0.168, 0.215, -0.022]),
      side,
    });
  }

  return k.done((t) => {
    for (const [i, bulb] of bulbs.entries()) {
      const swing = Math.sin(t * 2.6 + i * 1.7) * 0.014;
      bulb.mesh.position.y = 0.215 + swing;
      bulb.mesh.position.x = bulb.side * (0.168 + swing * 0.6);
    }
  }, bulbs[0]?.mesh);
}

/** Your own small weather system. It rains, and occasionally it forks. */
function buildStormCloud(): BuiltArt {
  const k = kit();

  for (const [x, y, z, r] of [
    [0, 0.25, 0, 0.125],
    [-0.13, 0.225, 0.03, 0.095],
    [0.14, 0.235, -0.02, 0.1],
    [0.02, 0.235, -0.13, 0.088],
    [-0.03, 0.245, 0.12, 0.092],
  ] as const) {
    const puff = k.add(new THREE.SphereGeometry(r, 10, 8), 'cloud', [x, y, z]);
    puff.scale.y = 0.82;
  }
  for (const [x, z, r] of [
    [-0.08, 0.02, 0.075],
    [0.08, -0.03, 0.07],
  ] as const) {
    const under = k.add(new THREE.SphereGeometry(r, 10, 8), 'cloudDark', [x, 0.175, z]);
    under.scale.y = 0.6;
  }

  const drops: THREE.Mesh[] = [];
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2;
    const radius = 0.05 + (i % 3) * 0.045;
    const drop = k.add(new THREE.CapsuleGeometry(0.008, 0.03, 3, 6), 'rain', [
      Math.sin(angle) * radius,
      0.1,
      Math.cos(angle) * radius,
    ]);
    drops.push(drop);
  }

  const bolt = k.group([0, 0.12, -0.06]);
  const shards = [
    [0.01, 0, 0.5],
    [-0.015, -0.055, -0.6],
    [0.012, -0.108, 0.45],
  ] as const;
  for (let i = 0; i < shards.length; i++) {
    const [x = 0, y = 0, rot = 0] = shards[i] ?? [];
    const shard = k.add(new THREE.BoxGeometry(0.016, 0.06, 0.012), 'spark', [x, y, 0]);
    shard.rotation.z = rot;
    shard.scale.y = 1 - i * 0.15;
    bolt.add(shard);
  }
  bolt.visible = false;

  const driver = k.add(new THREE.SphereGeometry(0.03, 8, 6), 'cloudDark', [0, 0.2, 0]);

  return k.done((t) => {
    for (const [i, drop] of drops.entries()) {
      // Each drop falls on its own phase and starts again inside the cloud.
      const fall = (t * 0.55 + i * 0.11) % 1;
      drop.position.y = 0.14 - fall * 0.32;
      drop.visible = fall > 0.06;
    }
    // A fork every few seconds, for two tenths of a second.
    bolt.visible = t % 3.4 < 0.16;
  }, driver);
}

/** A lit candelabra, balanced on your head, in a building full of things that hunt by sound. */
function buildCandelabra(): BuiltArt {
  const k = kit();

  k.add(new THREE.CylinderGeometry(0.115, 0.135, 0.028, 18), 'brass', [0, -0.05, 0]);
  k.add(new THREE.CylinderGeometry(0.026, 0.032, 0.14, 12), 'brass', [0, 0.04, 0]);
  k.add(new THREE.SphereGeometry(0.038, 12, 10), 'brass', [0, 0.115, 0]);

  const flames: THREE.Mesh[] = [];
  for (const [x, z, top] of [
    [0, 0, 0.235],
    [-0.13, 0.02, 0.175],
    [0.13, -0.02, 0.175],
  ] as const) {
    if (x !== 0) {
      const arm = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0.09, 0),
          new THREE.Vector3(x * 0.6, 0.12, z * 0.6),
          new THREE.Vector3(x, 0.135, z),
        ]),
        14,
        0.014,
        8,
        false,
      );
      k.add(arm, 'brass');
      k.add(new THREE.CylinderGeometry(0.035, 0.028, 0.022, 12), 'brass', [x, 0.14, z]);
    }
    k.add(new THREE.CylinderGeometry(0.019, 0.021, top - 0.14, 10), 'wax', [x, (top + 0.14) / 2 - 0.005, z]);
    const flame = k.add(new THREE.SphereGeometry(0.026, 10, 10), 'flame', [x, top + 0.03, z]);
    flame.scale.set(0.7, 1.5, 0.7);
    flames.push(flame);
  }

  return k.done((t) => {
    for (const [i, flame] of flames.entries()) {
      const wobble = Math.sin(t * (8 + i * 1.7) + i);
      flame.scale.set(0.68 + wobble * 0.05, 1.42 + wobble * 0.2, 0.68 + wobble * 0.05);
    }
  }, flames[0]);
}

/**
 * The registry, merged into `sharedArt`. Adding a hat is a builder, a line
 * here, and an entry in `config/player.json -> customisation.hats`.
 *
 * `hat.none` is a real, registered, empty builder rather than a null the rest
 * of the game has to remember to check for - bare-headed is a choice in the
 * wardrobe like any other, and this is what makes it cost nothing to handle.
 */
export const hatArt: ArtRegistry = {
  'hat.none': (): BuiltArt => ({ object: new THREE.Group(), colliders: [], parts: {} }),
  'hat.flatCap': buildFlatCap,
  'hat.topHat': buildTopHat,
  'hat.hardHat': buildHardHat,
  'hat.beanie': buildBeanie,
  'hat.cowboy': buildCowboy,
  'hat.minersLamp': buildMinersLamp,
  'hat.crown': buildCrown,
  'hat.paperBoat': buildPaperBoat,
  'hat.trafficCone': buildTrafficCone,
  'hat.rubberDuck': buildRubberDuck,
  'hat.birthdayCake': buildBirthdayCake,
  'hat.propeller': buildPropeller,
  'hat.halo': buildHalo,
  'hat.antennae': buildAntennae,
  'hat.stormCloud': buildStormCloud,
  'hat.candelabra': buildCandelabra,
};
