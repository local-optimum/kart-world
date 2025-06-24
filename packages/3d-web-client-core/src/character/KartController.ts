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
    maxSpeed: 120, // Reduced from 200 for better balance
    acceleration: 70,
    deceleration: 70,
    steeringSpeed: 1.8,
    driftFactor: 0.4,
    groundFriction: 0.95,
    airResistance: 0.008,
    bounceRestitution: 0.6,
  };

  private velocity: Vector3 = new Vector3();
  private angularVelocity: number = 0;
  private isDrifting: boolean = false;
  private isGrounded: boolean = true;
  private throttleInput: number = 0;
  private steeringInput: number = 0;
  private isSkidding: boolean = false;
  private isReversing: boolean = false; // Track reverse state

  private rayCaster: Raycaster = new Raycaster();
  private kartBounds = {
    width: 1.4,
    height: 0.5, // Adjusted for new wheel positioning - bottom of wheels at ground level
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

    // Realistic steering: invert when reversing (front wheels control direction, but moving backward)
    const effectiveSteering = this.isReversing ? -input.steering : input.steering;
    this.steeringInput = this.smoothInput(
      this.steeringInput,
      effectiveSteering,
      steeringSmoothRate * this.config.timeManager.deltaTime,
    );

    // Automatic drift when turning hard at speed - improved for high speeds
    const speed = this.velocity.length();
    const isHardTurning = Math.abs(this.steeringInput) > 0.3; // Easier to trigger drift
    const isMovingFast = speed > 15; // Higher speed threshold for better high-speed drifting
    // Enter drift state when turning hard at speed
    this.isDrifting = isHardTurning && isMovingFast && Math.abs(this.throttleInput) > 0.1;
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
    // Pass negative speed when reversing for proper wheel animation
    const displaySpeed = this.isReversing ? -currentSpeed : currentSpeed;
    this.config.character.updateKartMovement(displaySpeed, this.steeringInput, deltaTime);
  }

  private updateLinearVelocity(deltaTime: number): void {
    if (Math.abs(this.throttleInput) > 0.01) {
      if (this.throttleInput > 0) {
        // FORWARD ACCELERATION - normal acceleration in forward direction
        this.isReversing = false; // Exit reverse mode when going forward
        const accelerationForce = this.throttleInput * this.kartConfig.acceleration;
        const forwardDirection = this.config.character.getWorldDirection(new Vector3());
        this.velocity.add(forwardDirection.multiplyScalar(accelerationForce * deltaTime));

        const currentSpeed = this.velocity.length();
        if (currentSpeed > this.kartConfig.maxSpeed) {
          this.velocity.normalize().multiplyScalar(this.kartConfig.maxSpeed);
        }
      } else {
        // REVERSE OR BRAKING - check if we should reverse or brake
        const currentSpeed = this.velocity.length();
        
        // Enter reverse mode if nearly stopped and pressing brake
        if (currentSpeed < 2.0 && this.throttleInput < -0.1) {
          this.isReversing = true;
        }
        
        // Stay in reverse mode while holding brake/reverse input
        if (this.isReversing && this.throttleInput < -0.1) {
          // REVERSE ACCELERATION - move backward at full speed for cool reverse drifts
          const reverseAcceleration = Math.abs(this.throttleInput) * this.kartConfig.acceleration; // Full acceleration, not reduced
          const backwardDirection = this.config.character.getWorldDirection(new Vector3()).negate();
          this.velocity.add(backwardDirection.multiplyScalar(reverseAcceleration * deltaTime));
          
          // Allow full reverse speed - same as forward for reverse drifts
          if (this.velocity.length() > this.kartConfig.maxSpeed) {
            this.velocity.normalize().multiplyScalar(this.kartConfig.maxSpeed);
          }
          
          // Debug logging
          if (Math.random() < 0.01) { // Log occasionally to avoid spam
            console.log("Reverse mode active - speed:", currentSpeed, "throttle:", this.throttleInput);
          }
        } else {
          // BRAKING - speed reduction plus directional friction to stop lateral slides
          this.isReversing = false; // Exit reverse mode when braking at higher speeds
          const brakingIntensity = Math.abs(this.throttleInput);
          
          if (currentSpeed > 0.1) {
            // SPEED-DEPENDENT BRAKING: smoother transition, less abrupt at low speeds
            let speedFactor;
            if (currentSpeed < 15) {
              speedFactor = 1.3; // Gentler 1.3x braking effectiveness at very low speeds
            } else if (currentSpeed < 40) {
              speedFactor = 1.1; // Slight boost at low-medium speeds
            } else {
              speedFactor = Math.max(0.3, 1 - currentSpeed / 100); // Normal curve for higher speeds
            }
            const adjustedBrakingIntensity = brakingIntensity * speedFactor;
            
            const speedReduction = 1 - adjustedBrakingIntensity * 0.9 * deltaTime; // 50% stronger than 3x
            const directionFriction = 1 - adjustedBrakingIntensity * 0.675 * deltaTime; // 50% stronger than 3x
            
            // Apply both effects to the entire velocity vector
            this.velocity.multiplyScalar(speedReduction * directionFriction);
            
            // Stop completely at very low speeds
            if (this.velocity.length() < 0.5) {
              this.velocity.multiplyScalar(0.9);
              if (this.velocity.length() < 0.1) {
                this.velocity.set(0, 0, 0);
              }
            }
          }
        }
      }
    } else {
      // No throttle input - exit reverse mode
      this.isReversing = false;
    }
  }

  private updateAngularVelocity(deltaTime: number): void {
    if (Math.abs(this.steeringInput) > 0.01) {
      const forwardSpeed = this.velocity.length();

      // REALISTIC STEERING: Need minimum speed to turn, reduced effectiveness at very low speeds
      if (forwardSpeed > 0.5) {
        // Calculate steering effectiveness based on speed
        let steeringEffectiveness;
        if (forwardSpeed < 3) {
          // Very low speeds: severely reduced steering (realistic - hard to turn when barely moving)
          steeringEffectiveness = 0.2;
        } else if (forwardSpeed < 8) {
          // Low speeds: reduced steering effectiveness
          steeringEffectiveness = 0.5;
        } else {
          // Normal speed-dependent steering for higher speeds
          const lowSpeedFactor = 1.0; // Full turning at moderate speeds
          const highSpeedReduction = 0.5; // Improved from 0.3 - less restrictive at high speeds
          const speedForMaxReduction = 30; // Speed at which turning is most reduced

          const speedRatio = Math.min(forwardSpeed / speedForMaxReduction, 1);
          steeringEffectiveness = lowSpeedFactor - speedRatio * (lowSpeedFactor - highSpeedReduction);
        }

        // Apply steering relative to current facing direction
        const steeringForce = this.steeringInput * steeringEffectiveness * this.kartConfig.steeringSpeed * 2;
        this.angularVelocity += steeringForce * deltaTime;

        // Limit maximum angular velocity based on steering effectiveness
        const baseMaxAngularVelocity = 4;
        const maxAngularVelocity = baseMaxAngularVelocity * steeringEffectiveness;
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

    // Simple air resistance - reduced when braking for better slides
    const isBraking = this.throttleInput < -0.1;
    const airResistanceMultiplier = isBraking ? 0.3 : 1.0; // 70% less air resistance when braking
    const airResistance = speed * this.kartConfig.airResistance * airResistanceMultiplier;
    const airResistanceVector = this.velocity
      .clone()
      .normalize()
      .multiplyScalar(-airResistance * deltaTime);
    this.velocity.add(airResistanceVector);

    // Ground friction - only when driving forward (not coasting or braking)
    if (this.isGrounded) {
      if (Math.abs(this.throttleInput) < 0.01) {
        // Coasting - minimal friction for sliding
        const coastingFriction = 0.995;
        this.velocity.multiplyScalar(coastingFriction);
      } else if (this.throttleInput > 0 && !this.isDrifting) {
        // Driving forward normally - apply grip
        this.velocity.multiplyScalar(this.kartConfig.groundFriction);
      }
      // No additional friction when braking - let it slide naturally
    }
  }

  private processDrift(deltaTime: number): void {
    if (this.isDrifting) {
      // ENHANCED MOMENTUM PRESERVATION: Much stronger preservation of original direction
      const forward = this.config.character.getWorldDirection(new Vector3());
      const speed = this.velocity.length();
      if (speed > 0.1) {
        // Calculate how much the velocity direction differs from where the car is pointing
        const velocityDirection = this.velocity.clone().normalize();
        
        // STRONGER momentum preservation based on speed - faster = more preservation
        const speedFactor = Math.min(speed / 40, 1); // Scale with speed up to 40 units
        const baseSteeringInfluence = 0.15; // Reduced from 0.3 for more momentum preservation
        const steeringInfluence = baseSteeringInfluence * (1 - speedFactor * 0.5); // Even less at high speeds
        const momentumPreservation = 1 - steeringInfluence;
        
        // Preserve most of the original momentum direction
        const preservedVelocity = velocityDirection.multiplyScalar(speed * momentumPreservation);
        // Add small steering influence based on car's forward direction
        const steeringVelocity = forward.multiplyScalar(speed * steeringInfluence);
        // Combine preserved momentum with steering influence
        this.velocity.copy(preservedVelocity.add(steeringVelocity));
        
        // Apply drift-specific friction (less than normal driving)
        const driftFriction = 0.985; // Even less friction during drift for longer slides
        this.velocity.multiplyScalar(driftFriction);
      }
    } else {
      // Normal driving: gradually align velocity with car direction
      const forward = this.config.character.getWorldDirection(new Vector3());
      const speed = this.velocity.length();

      if (speed > 0.1) {
        // PRESERVE MOMENTUM during braking - don't snap to new direction
        const isBraking = this.throttleInput < -0.1;
        
        if (isBraking) {
          // During braking: NO alignment to fully preserve sliding momentum
          // Let the kart slide in whatever direction it's moving - pure momentum preservation
          // Only the braking force itself will slow you down, not change direction
        } else {
          // Normal driving: gradually align velocity with car direction
          const speedFactor = Math.min(speed / 40, 1); // Less alignment at higher speeds
          const baseAlignmentRate = 1.5 * deltaTime; // Reduced base rate
          const alignmentRate = baseAlignmentRate * (1 - speedFactor * 0.8); // Much more reduction at high speeds
          const targetVelocity = forward.multiplyScalar(speed);
          this.velocity.lerp(targetVelocity, alignmentRate);
        }
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
    // Store previous position for collision detection
    const previousPosition = this.config.character.position.clone();

    // Apply movement
    const deltaMovement = this.velocity.clone().multiplyScalar(deltaTime);
    this.config.character.position.add(deltaMovement);

    // Check for collisions and apply collision response
    this.handleCollisions(previousPosition, deltaTime);
  }

  private handleCollisions(previousPosition: Vector3, deltaTime: number): void {
    // Create a capsule-like collision check around the kart
    const kartPosition = this.config.character.position;
    const kartBounds = this.kartBounds;

    // Check for collisions using multiple raycasts around the kart perimeter
    const collisionChecks = this.performCollisionChecks(kartPosition, kartBounds);

    if (collisionChecks.length > 0) {
      // Handle the collision response
      this.applyCollisionResponse(collisionChecks, previousPosition, deltaTime);
    }
  }

  private performCollisionChecks(kartPosition: Vector3, kartBounds: any): Array<{
    normal: Vector3;
    distance: number;
    point: Vector3;
  }> {
    const collisions: Array<{
      normal: Vector3;
      distance: number;
      point: Vector3;
    }> = [];

    // Get kart's forward and right directions
    const forward = this.config.character.getWorldDirection(new Vector3());
    const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize();

    // Define collision check points around the kart perimeter
    const checkPoints = [
      // Front center
      kartPosition.clone().add(forward.clone().multiplyScalar(kartBounds.length / 2)),
      // Front left
      kartPosition
        .clone()
        .add(forward.clone().multiplyScalar(kartBounds.length / 2))
        .add(right.clone().multiplyScalar(-kartBounds.width / 2)),
      // Front right
      kartPosition
        .clone()
        .add(forward.clone().multiplyScalar(kartBounds.length / 2))
        .add(right.clone().multiplyScalar(kartBounds.width / 2)),
      // Left side
      kartPosition.clone().add(right.clone().multiplyScalar(-kartBounds.width / 2)),
      // Right side
      kartPosition.clone().add(right.clone().multiplyScalar(kartBounds.width / 2)),
      // Rear center
      kartPosition.clone().add(forward.clone().multiplyScalar(-kartBounds.length / 2)),
      // Rear left
      kartPosition
        .clone()
        .add(forward.clone().multiplyScalar(-kartBounds.length / 2))
        .add(right.clone().multiplyScalar(-kartBounds.width / 2)),
      // Rear right
      kartPosition
        .clone()
        .add(forward.clone().multiplyScalar(-kartBounds.length / 2))
        .add(right.clone().multiplyScalar(kartBounds.width / 2)),
    ];

    // Check each point for collisions
    checkPoints.forEach((checkPoint, index) => {
      // Cast rays in multiple directions from each check point
      const rayDirections = [
        forward.clone(),
        forward.clone().negate(),
        right.clone(),
        right.clone().negate(),
      ];

      rayDirections.forEach((direction) => {
        this.rayCaster.set(checkPoint, direction);
        const hit = this.config.collisionsManager.raycastFirst(
          this.rayCaster.ray,
          kartBounds.length / 2 + 0.1, // Small collision margin
        );

        if (hit) {
          const [distance, normal, , point] = hit;
          if (distance < kartBounds.length / 2 + 0.05) {
            collisions.push({
              normal: normal.clone(),
              distance,
              point: point.clone(),
            });
          }
        }
      });
    });

    return collisions;
  }

  private applyCollisionResponse(
    collisions: Array<{ normal: Vector3; distance: number; point: Vector3 }>,
    previousPosition: Vector3,
    deltaTime: number,
  ): void {
    if (collisions.length === 0) return;

    // Calculate average collision normal
    const avgNormal = new Vector3();
    collisions.forEach((collision) => {
      avgNormal.add(collision.normal);
    });
    avgNormal.divideScalar(collisions.length).normalize();

    // Calculate penetration depth
    const minDistance = Math.min(...collisions.map((c) => c.distance));
    const penetration = Math.max(0, this.kartBounds.length / 2 - minDistance + 0.05);

    // Position correction - push kart out of collision
    if (penetration > 0.001) {
      this.config.character.position.add(avgNormal.clone().multiplyScalar(penetration));
    }

    // Velocity response - bounce and friction
    this.handleVelocityCollisionResponse(avgNormal, penetration);
  }

  private handleVelocityCollisionResponse(normal: Vector3, penetration: number): void {
    const speed = this.velocity.length();

    if (speed < 0.1) return; // Skip if barely moving

    // Separate velocity into normal and tangential components
    const velocityNormal = this.velocity.clone().projectOnVector(normal);
    const velocityTangent = this.velocity.clone().sub(velocityNormal);

    // Apply bounce to normal component
    const bounceVelocity = velocityNormal.clone().multiplyScalar(-this.kartConfig.bounceRestitution);

    // Apply friction to tangential component
    const frictionFactor = 0.7; // Reduce sliding along walls
    const frictionVelocity = velocityTangent.clone().multiplyScalar(frictionFactor);

    // Combine bounce and friction
    this.velocity.copy(bounceVelocity.add(frictionVelocity));

    // Limit bounce velocity to prevent excessive forces
    const maxBounceSpeed = this.kartConfig.maxSpeed * 0.8;
    if (this.velocity.length() > maxBounceSpeed) {
      this.velocity.normalize().multiplyScalar(maxBounceSpeed);
    }

    // Add some rotational effect from the collision
    const impactForce = Math.min(speed / this.kartConfig.maxSpeed, 1);
    const rotationalImpulse = impactForce * 0.5; // Moderate spin from collision

    // Determine spin direction based on collision angle
    const forward = this.config.character.getWorldDirection(new Vector3());
    const collisionAngle = normal.dot(forward);

    if (Math.abs(collisionAngle) < 0.7) {
      // Side collision
      const spinDirection = normal.clone().cross(new Vector3(0, 1, 0)).dot(forward);
      this.angularVelocity += spinDirection * rotationalImpulse;
    }
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

  public isInReverse(): boolean {
    return this.isReversing;
  }

  public getWheelPositions(): Vector3[] {
    const kartPosition = this.config.character.position;
    const kartRotation = this.config.character.rotation;

    // Calculate wheel positions relative to kart center
    // Updated to match new KartMesh wheel positioning
    const wheelOffset = {
      rear: -0.8, // Distance from center to rear wheels (behind the kart)
      side: 0.7, // Distance from center to side wheels
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
    
    if (!this.isGrounded || speed < 3) {
      this.isSkidding = false;
      return;
    }

    // PROPER LATERAL SLIP DETECTION - the key to realistic skid marks!
    const forward = this.config.character.getWorldDirection(new Vector3());
    const velocityDirection = this.velocity.clone().normalize();
    
    // Calculate how much the velocity differs from the forward direction (lateral slip)
    const forwardAlignment = forward.dot(velocityDirection);
    const lateralSlipAmount = 1 - Math.abs(forwardAlignment); // 0 = no slip, 1 = full sideways
    
    // Calculate various skidding conditions
    const hardBraking = this.throttleInput < -0.3 && speed > 5;
    const isLateralSlipping = lateralSlipAmount > 0.3; // Significant sideways movement
    const isDriftingFast = this.isDrifting && speed > 8;
    const hardTurningAtSpeed = Math.abs(this.steeringInput) > 0.5 && speed > 12;
    
    // Skid marks trigger when there's actual lateral slip OR heavy braking
    this.isSkidding = isLateralSlipping || hardBraking || isDriftingFast || hardTurningAtSpeed;
    
    // Skid marks will only trigger during these action moments:
    // - Lateral slipping during drifts
    // - Hard braking at speed  
    // - High-speed sharp turning
  }
}
