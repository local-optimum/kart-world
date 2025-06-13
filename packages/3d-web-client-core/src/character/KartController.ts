import { Euler, Quaternion, Raycaster, Vector3 } from "three";

import { CameraManager } from "../camera/CameraManager";
import { CollisionsManager } from "../collisions/CollisionsManager";
import { KeyInputManager } from "../input/KeyInputManager";
import { VirtualJoystick } from "../input/VirtualJoystick";
import { TimeManager } from "../time/TimeManager";

import { Character } from "./Character";
import { SpawnConfigurationState } from "./CharacterManager";
import { CharacterState } from "./CharacterState";

export interface KartPhysicsConfig {
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
  steeringSpeed: number;
  driftFactor: number;
  groundFriction: number;
  airResistance: number;
  bounceRestitution: number;
}

export type LocalControllerConfig = {
  id: number;
  character: Character;
  collisionsManager: CollisionsManager;
  keyInputManager: KeyInputManager;
  virtualJoystick?: VirtualJoystick;
  cameraManager: CameraManager;
  timeManager: TimeManager;
  spawnConfiguration: SpawnConfigurationState;
};

export interface KartControlInput {
  throttle: number;
  steering: number;
  drift: boolean;
}

export class KartController {
  public networkState: CharacterState;

  private kartConfig: KartPhysicsConfig = {
    maxSpeed: 20,
    acceleration: 8,
    deceleration: 12,
    steeringSpeed: 2.5,
    driftFactor: 0.85,
    groundFriction: 0.98,
    airResistance: 0.02,
    bounceRestitution: 0.6,
  };

  private velocity: Vector3 = new Vector3();
  private angularVelocity: number = 0;
  private isDrifting: boolean = false;
  private isGrounded: boolean = true;
  private throttleInput: number = 0;
  private steeringInput: number = 0;

  private rayCaster: Raycaster = new Raycaster();
  private kartBounds = {
    width: 1.2,
    height: 0.8,
    length: 1.8,
  };

  private minimumX: number;
  private maximumX: number;
  private minimumY: number;
  private maximumY: number;
  private minimumZ: number;
  private maximumZ: number;

  constructor(private config: LocalControllerConfig) {
    this.networkState = {
      id: this.config.id,
      position: { x: 0, y: 0, z: 0 },
      rotation: { quaternionY: 0, quaternionW: 1 },
      state: 0,
    };

    this.minimumX = this.config.spawnConfiguration.respawnTrigger.minX;
    this.maximumX = this.config.spawnConfiguration.respawnTrigger.maxX;
    this.minimumY = this.config.spawnConfiguration.respawnTrigger.minY;
    this.maximumY = this.config.spawnConfiguration.respawnTrigger.maxY;
    this.minimumZ = this.config.spawnConfiguration.respawnTrigger.minZ;
    this.maximumZ = this.config.spawnConfiguration.respawnTrigger.maxZ;
  }

  public update(): void {
    const controlInput = this.getKartInput();

    if (controlInput) {
      this.processInput(controlInput);
      this.updateKartPhysics(this.config.timeManager.deltaTime);
    } else {
      this.applyPassiveDeceleration(this.config.timeManager.deltaTime);
    }

    this.maintainGroundContact();
    this.checkRespawnBounds();
    this.updateNetworkState();
  }

  private getKartInput(): KartControlInput | null {
    const rawInput = this.config.keyInputManager.getOutput();

    if (!rawInput) {
      return null;
    }

    // Handle current character input format temporarily
    if ("direction" in rawInput) {
      const forward = this.config.keyInputManager.isKeyPressed("w");
      const backward = this.config.keyInputManager.isKeyPressed("s");
      const left = this.config.keyInputManager.isKeyPressed("a");
      const right = this.config.keyInputManager.isKeyPressed("d");
      const drift = this.config.keyInputManager.isKeyPressed(" ");

      const throttle = (forward ? 1 : 0) + (backward ? -1 : 0);
      const steering = (right ? 1 : 0) + (left ? -1 : 0);

      if (throttle === 0 && steering === 0 && !drift) {
        return null;
      }

      return { throttle, steering, drift };
    }

    return rawInput as KartControlInput;
  }

  private processInput(input: KartControlInput): void {
    const inputSmoothRate = 8;
    const steeringSmoothRate = 12;

    this.throttleInput = this.smoothInput(
      this.throttleInput,
      input.throttle,
      inputSmoothRate * this.config.timeManager.deltaTime,
    );

    this.steeringInput = this.smoothInput(
      this.steeringInput,
      input.steering,
      steeringSmoothRate * this.config.timeManager.deltaTime,
    );

    this.isDrifting = input.drift;
  }

  private smoothInput(current: number, target: number, rate: number): number {
    const difference = target - current;
    const maxChange = rate * Math.sign(difference);

    if (Math.abs(difference) <= Math.abs(maxChange)) {
      return target;
    }

    return current + maxChange;
  }

  private updateKartPhysics(deltaTime: number): void {
    this.updateLinearVelocity(deltaTime);
    this.updateAngularVelocity(deltaTime);
    this.applyResistance(deltaTime);
    this.processDrift(deltaTime);
    this.updateCharacterTransform(deltaTime);
  }

  private updateLinearVelocity(deltaTime: number): void {
    if (Math.abs(this.throttleInput) > 0.01) {
      const accelerationForce =
        this.throttleInput *
        (this.throttleInput > 0 ? this.kartConfig.acceleration : this.kartConfig.deceleration);

      const forwardDirection = this.config.character.getWorldDirection(new Vector3());
      this.velocity.add(forwardDirection.multiplyScalar(accelerationForce * deltaTime));

      const currentSpeed = this.velocity.length();
      const maxSpeed =
        this.throttleInput >= 0 ? this.kartConfig.maxSpeed : this.kartConfig.maxSpeed * 0.4;

      if (currentSpeed > maxSpeed) {
        this.velocity.normalize().multiplyScalar(maxSpeed);
      }
    }
  }

  private updateAngularVelocity(deltaTime: number): void {
    if (Math.abs(this.steeringInput) > 0.01) {
      const forwardSpeed = this.velocity.length();
      const speedFactor = Math.min(forwardSpeed / 5, 1);
      const effectiveSteering = this.steeringInput * speedFactor;

      this.angularVelocity = effectiveSteering * this.kartConfig.steeringSpeed;
      this.config.character.rotation.y += this.angularVelocity * deltaTime;
    }
  }

  private applyResistance(deltaTime: number): void {
    const airResistance = this.velocity.length() * this.kartConfig.airResistance;
    const resistanceVector = this.velocity
      .clone()
      .normalize()
      .multiplyScalar(-airResistance * deltaTime);
    this.velocity.add(resistanceVector);

    if (!this.isDrifting && this.isGrounded) {
      this.velocity.multiplyScalar(this.kartConfig.groundFriction);
    }
  }

  private processDrift(deltaTime: number): void {
    if (this.isDrifting) {
      const forward = this.config.character.getWorldDirection(new Vector3());
      const velocityForward = this.velocity.clone().projectOnVector(forward);
      const velocityLateral = this.velocity.clone().sub(velocityForward);

      velocityLateral.multiplyScalar(this.kartConfig.driftFactor);
      this.velocity.copy(velocityForward.add(velocityLateral));
    } else {
      const forward = this.config.character.getWorldDirection(new Vector3());
      const speed = this.velocity.length();

      if (speed > 0.1) {
        const alignmentRate = 5 * deltaTime;
        const targetVelocity = forward.multiplyScalar(speed);
        this.velocity.lerp(targetVelocity, alignmentRate);
      }
    }
  }

  private applyPassiveDeceleration(deltaTime: number): void {
    const passiveDeceleration = 3;
    const decelerationAmount = passiveDeceleration * deltaTime;

    if (this.velocity.length() > decelerationAmount) {
      const decelerationVector = this.velocity
        .clone()
        .normalize()
        .multiplyScalar(-decelerationAmount);
      this.velocity.add(decelerationVector);
    } else {
      this.velocity.set(0, 0, 0);
    }
  }

  private updateCharacterTransform(deltaTime: number): void {
    this.config.character.position.add(this.velocity.clone().multiplyScalar(deltaTime));
  }

  private maintainGroundContact(): void {
    this.rayCaster.set(this.config.character.position, new Vector3(0, -1, 0));
    const groundHit = this.config.collisionsManager.raycastFirst(this.rayCaster.ray);

    if (groundHit) {
      const [distance] = groundHit;
      const targetHeight =
        this.config.character.position.y - distance + this.kartBounds.height / 2;

      const heightDifference = targetHeight - this.config.character.position.y;
      this.config.character.position.y += heightDifference * 10 * this.config.timeManager.deltaTime;

      this.isGrounded = distance < this.kartBounds.height + 0.1;
    } else {
      this.isGrounded = false;
      this.velocity.y -= 9.8 * this.config.timeManager.deltaTime;
    }
  }

  private checkRespawnBounds(): void {
    const position = this.config.character.position;

    if (
      position.x < this.minimumX ||
      position.x > this.maximumX ||
      position.y < this.minimumY ||
      position.y > this.maximumY ||
      position.z < this.minimumZ ||
      position.z > this.maximumZ
    ) {
      this.resetPosition();
    }
  }

  private updateNetworkState(): void {
    const position = this.config.character.position;
    const rotation = this.config.character.rotation;
    const quaternion = new Quaternion().setFromEuler(rotation);

    this.networkState = {
      id: this.config.id,
      position: {
        x: position.x,
        y: position.y,
        z: position.z,
      },
      rotation: {
        quaternionY: quaternion.y,
        quaternionW: quaternion.w,
      },
      state: 0,
    };
  }

  public resetPosition(): void {
    const randomWithVariance = (value: number, variance: number): number => {
      return value + (Math.random() - 0.5) * 2 * variance;
    };

    const newPosition = new Vector3(
      randomWithVariance(
        this.config.spawnConfiguration.spawnPosition.x,
        this.config.spawnConfiguration.spawnPositionVariance.x,
      ),
      randomWithVariance(
        this.config.spawnConfiguration.spawnPosition.y,
        this.config.spawnConfiguration.spawnPositionVariance.y,
      ),
      randomWithVariance(
        this.config.spawnConfiguration.spawnPosition.z,
        this.config.spawnConfiguration.spawnPositionVariance.z,
      ),
    );

    this.config.character.position.copy(newPosition);

    this.velocity.set(0, 0, 0);
    this.angularVelocity = 0;
    this.throttleInput = 0;
    this.steeringInput = 0;
    this.isDrifting = false;
  }

  public updateSpawnConfig(spawnConfig: SpawnConfigurationState): void {
    this.config.spawnConfiguration = spawnConfig;
    this.minimumX = spawnConfig.respawnTrigger.minX;
    this.maximumX = spawnConfig.respawnTrigger.maxX;
    this.minimumY = spawnConfig.respawnTrigger.minY;
    this.maximumY = spawnConfig.respawnTrigger.maxY;
    this.minimumZ = spawnConfig.respawnTrigger.minZ;
    this.maximumZ = spawnConfig.respawnTrigger.maxZ;
  }
} 