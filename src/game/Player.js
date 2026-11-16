import * as THREE from 'three';

const TAU = Math.PI * 2;
const SOLID = new THREE.Color().setRGB(0, 0, 1); // data color: drawn crisp, not as glyphs
const wrap = (a) => ((a % TAU) + TAU) % TAU;

/**
 * The ship: orbits the center at a fixed radius. Left/right input steers;
 * counter-steering bites harder so turning around never feels sluggish.
 */
export class Player {
  constructor(scene) {
    this.radius = 1.35;
    this.speed = 11;      // rad/s; WallManager's PLAYER_RAD_S assumes this
    this.accel = 140;
    this.damping = 48;

    // Hitbox: narrower than the drawn ship, so a graze that looks close is safe
    this.halfArc = 0.068;
    this.hitBottom = 1.28;
    this.hitTop = 1.42;

    const shape = new THREE.Shape();
    shape.moveTo(0, 0.2);
    shape.lineTo(-0.13, -0.11);
    shape.lineTo(0, -0.05);
    shape.lineTo(0.13, -0.11);
    shape.closePath();
    this.ship = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: SOLID }));
    this.group = new THREE.Group();
    this.group.add(this.ship);
    scene.add(this.group);

    this.reset();
  }

  reset() {
    this.angle = this.prevAngle = Math.PI / 2;
    this.vel = 0;
    this.tilt = 0;
    this.render(1, 0);
  }

  /** dir: +1 counter-clockwise (left), -1 clockwise (right), 0 coast */
  update(dt, dir) {
    this.prevAngle = this.angle;
    if (dir) {
      const counter = this.vel * dir < -0.5 ? 3.5 : 1;
      this.vel += (dir * this.speed - this.vel) * Math.min(1, dt * this.accel * counter);
    } else {
      this.vel -= this.vel * Math.min(1, dt * this.damping);
      if (Math.abs(this.vel) < 0.05) this.vel = 0;
    }
    this.angle = wrap(this.angle + this.vel * dt);
  }

  /** Interpolates between the last two simulation steps */
  render(alpha, dt) {
    let d = this.angle - this.prevAngle;
    if (d > Math.PI) d -= TAU;
    else if (d < -Math.PI) d += TAU;
    const a = this.prevAngle + d * alpha;
    this.group.position.set(Math.cos(a) * this.radius, Math.sin(a) * this.radius, 0.05);
    this.group.rotation.z = a - Math.PI / 2;
    const lean = -Math.max(-1, Math.min(1, this.vel / this.speed)) * 0.35; // leans into the turn
    this.tilt += (lean - this.tilt) * Math.min(1, dt * 25);
    this.ship.rotation.z = this.tilt;
  }

  get position() {
    return this.group.position;
  }

  getHitbox() {
    return { angle: this.angle, halfArc: this.halfArc, bottom: this.hitBottom, top: this.hitTop, radius: this.radius };
  }
}
