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
    maxSpeed: 300, // Doubled from 500 for higher top speed
    acceleration: 75,
    deceleration: 70,
    steeringSpeed: 2.5,
    driftFactor: 0.4,
    groundFriction: 0.88,
    airResistance: 0.015,
    bounceRestitution: 0.6,
  };

  private velocity: Vector3 = new Vector3();
  private angularVelocity: number = 0;
  private isDrifting: boolean = false;
  private isGrounded: boolean = true;
  private throttleInput: number = 0;
  private steeringInput: number = 0;
  private isSkidding: boolean = false;

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
    } else {
      // No input - coast with inertia (gradually reduce inputs to 0)
      this.applyInputDecay(this.config.timeManager.deltaTime);
    }

    // Always update physics and position for proper inertia
    this.updateKartPhysics(this.config.timeManager.deltaTime);

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

      const throttle = (forward ? 1 : 0) + (backward ? -1 : 0);
      // STEERING MAPPING - CONSISTENT REGARDLESS OF SPAWN DIRECTION
      // Left always means left relative to where the kart is facing
      // Right always means right relative to where the kart is facing
      const steering = (left ? 1 : 0) + (right ? -1 : 0);

      if (throttle === 0 && steering === 0) {
        return null;
      }

      return { throttle, steering, drift: false };
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

    // Automatic drift when turning hard at speed
    const speed = this.velocity.length();
    const isHardTurning = Math.abs(this.steeringInput) > 0.4; // Easier to trigger drift
    const isMovingFast = speed > 8; // Lower speed threshold
    // Enter drift state when turning hard at speed
    this.isDrifting = isHardTurning && isMovingFast && Math.abs(this.throttleInput) > 0.2;
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
    this.updateSkiddingState();

    // Update visual kart animations (wheels, etc.)
    const currentSpeed = this.velocity.length();
    this.config.character.updateKartMovement(currentSpeed, this.steeringInput, deltaTime);
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

      // Only allow steering if the kart is moving (realistic behavior)
      if (forwardSpeed > 0.5) {
        // Minimum speed required to turn
        // Much more responsive steering for donut-making fun!
        // High responsiveness at low speeds, still good at high speeds
        const minSpeedFactor = 0.8; // Much higher minimum turning (was 0.3)
        const speedForTurning = 12; // Higher speed threshold for full effectiveness
        const speedFactor =
          minSpeedFactor + (1 - minSpeedFactor) * Math.min(forwardSpeed / speedForTurning, 1);
        console.log("speedFactor", speedFactor, forwardSpeed, speedForTurning);

        // Apply steering relative to current facing direction
        // Positive steering = left turn, Negative steering = right turn
        // This works regardless of spawn orientation
        const steeringForce = this.steeringInput * speedFactor * this.kartConfig.steeringSpeed * 3;
        this.angularVelocity += steeringForce * deltaTime;

        // Limit maximum angular velocity
        const maxAngularVelocity = 4; // Radians per second
        this.angularVelocity = Math.max(
          -maxAngularVelocity,
          Math.min(maxAngularVelocity, this.angularVelocity),
        );
      }
    }

    // Apply angular velocity to rotation (in LOCAL space, not world space)
    // This ensures steering is always relative to current facing direction
    // Use rotateY which applies rotation in the object's local coordinate system
    this.config.character.rotateY(this.angularVelocity * deltaTime);

    // Apply angular friction/damping when not steering or when stationary
    if (Math.abs(this.steeringInput) < 0.01 || this.velocity.length() < 0.5) {
      const angularFriction = 0.92; // How quickly rotation slows down
      this.angularVelocity *= angularFriction;
    }
  }

  private applyResistance(deltaTime: number): void {
    const speed = this.velocity.length();

    // Air resistance is always applied
    const airResistance = speed * this.kartConfig.airResistance;
    const airResistanceVector = this.velocity
      .clone()
      .normalize()
      .multiplyScalar(-airResistance * deltaTime);
    this.velocity.add(airResistanceVector);

    // Ground friction - different behavior when coasting vs driving
    if (this.isGrounded) {
      if (Math.abs(this.throttleInput) < 0.01) {
        // Coasting - much less friction for more sliding/floating
        const coastingFriction = 0.99; // Much more coasting (was 0.97)
        this.velocity.multiplyScalar(coastingFriction);
      } else if (!this.isDrifting) {
        // Driving normally - reduced grip
        this.velocity.multiplyScalar(this.kartConfig.groundFriction);
      }
      // When drifting, friction is handled in processDrift() method for proper lateral sliding
    }
  }

  private processDrift(deltaTime: number): void {
    if (this.isDrifting) {
      // PROPER DRIFT PHYSICS: Preserve momentum while reducing lateral grip
      // The key is to maintain the original velocity direction while allowing some steering influence
      const forward = this.config.character.getWorldDirection(new Vector3());
      const speed = this.velocity.length();
      if (speed > 0.1) {
        // Calculate how much the velocity direction differs from where the car is pointing
        const velocityDirection = this.velocity.clone().normalize();
        // Instead of forcing alignment, let the car "slide" in its momentum direction
        // while gradually allowing steering to influence the velocity
        const steeringInfluence = 0.3; // How much steering can influence drift direction
        const momentumPreservation = 1 - steeringInfluence;
        // Preserve most of the original momentum direction
        const preservedVelocity = velocityDirection.multiplyScalar(speed * momentumPreservation);
        // Add small steering influence based on car's forward direction
        const steeringVelocity = forward.multiplyScalar(speed * steeringInfluence);
        // Combine preserved momentum with steering influence
        this.velocity.copy(preservedVelocity.add(steeringVelocity));
        // Apply drift-specific friction (less than normal driving)
        const driftFriction = 0.98; // Much less friction during drift
        this.velocity.multiplyScalar(driftFriction);
      }
    } else {
      // Normal driving: gradually align velocity with car direction
      const forward = this.config.character.getWorldDirection(new Vector3());
      const speed = this.velocity.length();

      if (speed > 0.1) {
        // Much slower alignment for more floaty feel
        const alignmentRate = 2 * deltaTime; // Reduced from 5 for more sliding
        const targetVelocity = forward.multiplyScalar(speed);
        this.velocity.lerp(targetVelocity, alignmentRate);
      }
    }
  }

  private applyInputDecay(deltaTime: number): void {
    // Much slower input decay for more momentum and sliding
    const inputDecayRate = 3; // Reduced from 6 for more momentum

    this.throttleInput = this.smoothInput(this.throttleInput, 0, inputDecayRate * deltaTime);
    this.steeringInput = this.smoothInput(this.steeringInput, 0, inputDecayRate * deltaTime);
    this.isDrifting = false; // Stop drifting when no inpu
  }

  private updateCharacterTransform(deltaTime: number): void {
    this.config.character.position.add(this.velocity.clone().multiplyScalar(deltaTime));
  }

  private maintainGroundContact(): void {
    this.rayCaster.set(this.config.character.position, new Vector3(0, -1, 0));
    const groundHit = this.config.collisionsManager.raycastFirst(this.rayCaster.ray);

    if (groundHit) {
      const [distance] = groundHit;
      const targetHeight = this.config.character.position.y - distance + this.kartBounds.height / 2;

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

  public getVelocity(): Vector3 {
    return this.velocity.clone();
  }

  public isCreatingSkidMarks(): boolean {
    return this.isSkidding;
  }

  public getWheelPositions(): Vector3[] {
    const kartPosition = this.config.character.position;
    const kartRotation = this.config.character.rotation;

    // Calculate wheel positions relative to kart center
    const wheelOffset = {
      rear: -1.0, // Distance from center to rear wheels (behind the kart)
      side: 0.6, // Distance from center to side wheels
    };

    const positions: Vector3[] = [];

    // Create rear wheel positions in local space
    const rearLeft = new Vector3(-wheelOffset.side, 0, wheelOffset.rear);
    const rearRight = new Vector3(wheelOffset.side, 0, wheelOffset.rear);

    // Transform to world space using kart's transform
    const kartMatrix = this.config.character.matrixWorld;
    rearLeft.applyMatrix4(kartMatrix);
    rearRight.applyMatrix4(kartMatrix);

    // Use ground detection to place skid marks on ground surface
    [rearLeft, rearRight].forEach((wheelPos) => {
      this.rayCaster.set(wheelPos, new Vector3(0, -1, 0));
      const groundHit = this.config.collisionsManager.raycastFirst(this.rayCaster.ray);

      if (groundHit) {
        const [distance] = groundHit;
        // Place skid mark slightly above the detected ground
        wheelPos.y = wheelPos.y - distance + 0.02;
      } else {
        // Fallback: place slightly above current wheel position
        wheelPos.y += 0.02;
      }
    });

    positions.push(rearLeft, rearRight);
    return positions;
  }

  private updateSkiddingState(): void {
    const speed = this.velocity.length();
    const hardBraking = this.throttleInput < -0.2 && speed > 1;
    const hardTurning = Math.abs(this.steeringInput) > 0.4 && speed > 8; // Easier to trigger
    const isDriftingFast = this.isDrifting && speed > 5;

    this.isSkidding = this.isGrounded && (hardBraking || hardTurning || isDriftingFast);
  }
}
