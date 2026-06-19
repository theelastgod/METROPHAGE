import Phaser from "phaser";
import { AGENT } from "../config";
import { AGENT_KEY } from "../assets/manifest";

enum AgentState {
  Idle = "idle",
  Wander = "wander",
}

/**
 * Ambient citizen — pure flavour. Simple idle <-> wander FSM around a home anchor,
 * collides with walls, no combat. Makes the district feel inhabited.
 */
export default class Agent extends Phaser.Physics.Arcade.Sprite {
  private home: Phaser.Math.Vector2;
  private target: Phaser.Math.Vector2;
  private fsm: AgentState = AgentState.Idle;
  private nextStateAt = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, tint: number) {
    super(scene, x, y, AGENT_KEY);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setTint(tint);
    this.setDepth(7);
    this.setCollideWorldBounds(true);
    (this.body as Phaser.Physics.Arcade.Body).setCircle(7, 2, 6);
    this.home = new Phaser.Math.Vector2(x, y);
    this.target = this.home.clone();
    this.enterIdle(0);
  }

  step(now: number) {
    if (this.fsm === AgentState.Idle) {
      this.setVelocity(0, 0);
      if (now >= this.nextStateAt) this.enterWander(now);
      return;
    }

    // Wander
    const d = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);
    if (d < 8 || now >= this.nextStateAt) {
      this.enterIdle(now);
      return;
    }
    const a = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);
    this.setVelocity(Math.cos(a) * AGENT.speed, Math.sin(a) * AGENT.speed);
    this.setRotation(a + Math.PI / 2);
  }

  private enterIdle(now: number) {
    this.fsm = AgentState.Idle;
    this.setVelocity(0, 0);
    this.nextStateAt =
      now + Phaser.Math.Between(AGENT.idleMinMs, AGENT.idleMaxMs);
  }

  private enterWander(now: number) {
    this.fsm = AgentState.Wander;
    const ang = Math.random() * Math.PI * 2;
    const rad = AGENT.wanderRadius * (0.3 + Math.random() * 0.7);
    this.target.set(
      this.home.x + Math.cos(ang) * rad,
      this.home.y + Math.sin(ang) * rad,
    );
    this.nextStateAt = now + 900 + Math.random() * AGENT.wanderMaxMs;
  }
}
