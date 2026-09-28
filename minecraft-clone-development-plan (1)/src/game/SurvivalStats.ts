import type { PlayerFrameState } from './Player';

/** Vida e fome desacopladas da física e da interface. */
export class SurvivalStats {
  health = 20;
  hunger = 20;

  private exhaustion = 0;
  private regenTimer = 0;
  private starvationTimer = 0;

  update(dt: number, frame: PlayerFrameState): void {
    // Correr gasta seis vezes mais energia que caminhar.
    this.exhaustion += frame.distanceMoved * (frame.sprinting ? 0.12 : 0.02);
    this.exhaustion += dt * 0.012;

    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      this.hunger = Math.max(0, this.hunger - 1);
    }

    if (frame.landedFallDistance > 3) {
      this.damage(Math.ceil(frame.landedFallDistance - 3));
    }

    // Fome alta regenera lentamente; fome zerada causa dano.
    if (this.hunger >= 18 && this.health < 20) {
      this.regenTimer += dt;
      if (this.regenTimer >= 4) {
        this.regenTimer = 0;
        this.health = Math.min(20, this.health + 1);
        this.hunger = Math.max(0, this.hunger - 0.5);
      }
    } else {
      this.regenTimer = 0;
    }

    if (this.hunger <= 0) {
      this.starvationTimer += dt;
      if (this.starvationTimer >= 4) {
        this.starvationTimer = 0;
        this.damage(1);
      }
    } else {
      this.starvationTimer = 0;
    }
  }

  addActionExhaustion(amount = 0.08): void {
    this.exhaustion += amount;
  }

  damage(amount: number): void {
    this.health = Math.max(0, this.health - amount);
  }

  get dead(): boolean {
    return this.health <= 0;
  }

  reset(): void {
    this.health = 20;
    this.hunger = 20;
    this.exhaustion = 0;
    this.regenTimer = 0;
    this.starvationTimer = 0;
  }
}