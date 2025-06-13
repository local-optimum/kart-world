# Kart Racing Physics and Controls Specification

## Overview
This document details the physics model and control system for the kart racing implementation. The design prioritizes fun, responsive gameplay while maintaining realistic feel and network synchronization compatibility.

## Physics Model

### Core Physics Properties

| Property | Value | Unit | Description |
|----------|-------|------|-------------|
| Max Speed | 20 | m/s | Maximum forward velocity |
| Reverse Max Speed | 8 | m/s | Maximum reverse velocity |
| Acceleration | 8 | m/s² | Forward acceleration rate |
| Deceleration | 12 | m/s² | Braking deceleration rate |
| Passive Deceleration | 3 | m/s² | Natural slowdown when not accelerating |
| Steering Speed | 2.5 | rad/s | Maximum angular velocity when turning |
| Drift Factor | 0.85 | ratio | Lateral friction reduction during drift |
| Ground Friction | 0.98 | coefficient | Base friction when not drifting |
| Air Resistance | 0.02 | coefficient | Speed-dependent resistance |
| Bounce Restitution | 0.6 | ratio | Energy retention in collisions |

### Physics Update Cycle

The physics system runs at 60fps with the following update sequence:

1. **Input Processing** - Convert user input to force vectors
2. **Velocity Update** - Apply acceleration, deceleration, and friction
3. **Position Update** - Integrate velocity to update position
4. **Rotation Update** - Apply steering based on forward speed
5. **Collision Detection** - Check for collisions with environment and other karts
6. **Collision Response** - Apply bounce forces and position corrections
7. **Ground Adherence** - Maintain contact with track surface
8. **State Sync** - Prepare network state for transmission

### Detailed Physics Calculations

#### Forward/Backward Movement
```typescript
// Acceleration based on throttle input
const accelerationForce = throttleInput * (
  throttleInput > 0 ? this.acceleration : this.deceleration
);

// Apply air resistance (increases with speed)
const airResistance = this.velocity.length() * this.airResistance;

// Net acceleration
const netAcceleration = accelerationForce - airResistance;

// Update velocity
this.velocity.add(
  this.character.getWorldDirection(new Vector3())
    .multiplyScalar(netAcceleration * deltaTime)
);

// Apply speed limits
const currentSpeed = this.velocity.length();
const maxSpeed = throttleInput >= 0 ? this.maxSpeed : this.reverseMaxSpeed;
if (currentSpeed > maxSpeed) {
  this.velocity.normalize().multiplyScalar(maxSpeed);
}
```

#### Steering and Angular Velocity
```typescript
// Steering effectiveness based on forward speed
const speedFactor = Math.min(Math.abs(this.forwardSpeed) / 5, 1);
const effectiveSteering = this.steeringInput * speedFactor;

// Calculate angular velocity
this.angularVelocity = effectiveSteering * this.steeringSpeed;

// Apply rotation
this.character.rotation.y += this.angularVelocity * deltaTime;

// Update velocity direction for realistic turning
if (!this.isDrifting && Math.abs(this.angularVelocity) > 0.1) {
  const turnRadius = this.forwardSpeed / this.angularVelocity;
  const lateralForce = this.forwardSpeed * this.angularVelocity * 0.1;
  
  const lateralDirection = new Vector3()
    .crossVectors(this.character.up, this.character.getWorldDirection(new Vector3()));
  
  this.velocity.add(
    lateralDirection.multiplyScalar(lateralForce * deltaTime)
  );
}
```

#### Drift Mechanics
```typescript
private processDrift(deltaTime: number): void {
  if (this.isDrifting) {
    // Reduce lateral friction to allow sliding
    const forward = this.character.getWorldDirection(new Vector3());
    const velocityForward = this.velocity.clone().projectOnVector(forward);
    const velocityLateral = this.velocity.clone().sub(velocityForward);
    
    // Preserve forward momentum, reduce lateral grip
    velocityLateral.multiplyScalar(this.driftFactor);
    this.velocity.copy(velocityForward.add(velocityLateral));
    
    // Visual feedback - slight rotation towards drift direction
    const driftIntensity = velocityLateral.length() / this.maxSpeed;
    this.kartTiltAngle = Math.sign(this.steeringInput) * driftIntensity * 0.2;
  } else {
    // Normal grip - velocity aligns with kart direction
    const forward = this.character.getWorldDirection(new Vector3());
    const speed = this.velocity.length();
    
    // Gradually align velocity with kart direction
    const alignmentRate = 5 * deltaTime;
    this.velocity.lerp(forward.multiplyScalar(speed), alignmentRate);
    
    this.kartTiltAngle *= (1 - 8 * deltaTime); // Return to upright
  }
}
```

## Control System

### Input Mapping

| Input | Action | Range | Description |
|-------|--------|-------|-------------|
| W | Accelerate | 0-1 | Forward thrust |
| S | Brake/Reverse | 0-1 | Backward thrust or braking |
| A | Steer Left | 0-1 | Left steering input |
| D | Steer Right | 0-1 | Right steering input |
| Space | Drift | Boolean | Handbrake/drift mode |
| Shift | Boost | Boolean | Future power-up activation |

### Input Processing

```typescript
interface KartControlInput {
  throttle: number;    // -1 (full reverse) to 1 (full forward)
  steering: number;    // -1 (full left) to 1 (full right)
  drift: boolean;      // handbrake active
  boost: boolean;      // boost active (future feature)
}

private processInput(input: KartControlInput): void {
  // Smooth input transitions for better feel
  this.throttleInput = this.smoothInput(
    this.throttleInput, 
    input.throttle, 
    8 * this.deltaTime // 8 units per second transition
  );
  
  this.steeringInput = this.smoothInput(
    this.steeringInput, 
    input.steering, 
    12 * this.deltaTime // Faster steering response
  );
  
  this.isDrifting = input.drift;
  
  // Handle boost (future feature)
  if (input.boost && this.boostRemaining > 0) {
    this.applyBoost();
  }
}

private smoothInput(current: number, target: number, rate: number): number {
  const difference = target - current;
  const maxChange = rate * Math.sign(difference);
  
  if (Math.abs(difference) <= Math.abs(maxChange)) {
    return target;
  }
  
  return current + maxChange;
}
```

### Alternative Control Schemes

#### Gamepad Support (Future Enhancement)
- Left stick: Steering (analog)
- Right trigger: Accelerate (analog)
- Left trigger: Brake/Reverse (analog)
- Right bumper: Drift
- A button: Boost

#### Mobile Touch Controls (Future Enhancement)
- Virtual steering wheel or left/right touch areas
- Accelerate/brake buttons or single-tap acceleration
- Drift button
- Tilt steering option

## Collision System

### Collision Detection
The kart uses a simplified box collider with the following dimensions:
- Length: 1.8m
- Width: 1.2m  
- Height: 0.8m

### Collision Response

#### Wall/Environment Collisions
```typescript
private handleWallCollision(collision: CollisionInfo): void {
  const normal = collision.normal;
  const penetration = collision.penetration;
  
  // Position correction
  this.character.position.add(normal.clone().multiplyScalar(penetration));
  
  // Velocity reflection with energy loss
  const velocityNormal = this.velocity.clone().projectOnVector(normal);
  const velocityTangent = this.velocity.clone().sub(velocityNormal);
  
  // Bounce back with reduced energy
  velocityNormal.multiplyScalar(-this.bounceRestitution);
  velocityTangent.multiplyScalar(0.8); // Friction against wall
  
  this.velocity.copy(velocityNormal.add(velocityTangent));
  
  // Limit bounce velocity to prevent excessive forces
  const maxBounceSpeed = this.maxSpeed * 0.7;
  if (this.velocity.length() > maxBounceSpeed) {
    this.velocity.normalize().multiplyScalar(maxBounceSpeed);
  }
}
```

#### Kart-to-Kart Collisions
```typescript
private handleKartCollision(otherKart: KartController, collision: CollisionInfo): void {
  const normal = collision.normal;
  const relativeVelocity = this.velocity.clone().sub(otherKart.velocity);
  const separatingVelocity = relativeVelocity.dot(normal);
  
  // Don't resolve if velocities are separating
  if (separatingVelocity > 0) return;
  
  // Calculate impulse
  const restitution = 0.8;
  const impulse = -(1 + restitution) * separatingVelocity / 2; // Equal mass assumption
  
  // Apply impulse to both karts
  const impulseVector = normal.clone().multiplyScalar(impulse);
  this.velocity.add(impulseVector);
  otherKart.velocity.sub(impulseVector);
  
  // Position separation
  const separation = normal.clone().multiplyScalar(collision.penetration / 2);
  this.character.position.add(separation);
  otherKart.character.position.sub(separation);
}
```

## Ground Adherence

### Track Surface Detection
```typescript
private maintainGroundContact(): void {
  const downwardRay = new Ray(this.character.position, new Vector3(0, -1, 0));
  const groundHit = this.collisionsManager.raycastFirst(downwardRay);
  
  if (groundHit) {
    const [distance, normal] = groundHit;
    const targetHeight = this.character.position.y - distance + this.kartHeight / 2;
    
    // Smooth ground following
    const heightDifference = targetHeight - this.character.position.y;
    this.character.position.y += heightDifference * 10 * this.deltaTime;
    
    // Align kart with ground normal (subtle effect)
    const currentUp = this.character.up;
    const targetUp = normal;
    currentUp.lerp(targetUp, 2 * this.deltaTime);
    
    this.isGrounded = distance < this.kartHeight + 0.1;
  } else {
    this.isGrounded = false;
    // Apply gravity when airborne
    this.velocity.y -= 9.8 * this.deltaTime;
  }
}
```

## Performance Optimizations

### Physics Update Frequency
- Main physics: 60fps (16.67ms intervals)
- Collision detection: 60fps with spatial partitioning
- Network updates: 20fps (50ms intervals) with interpolation
- Visual updates: Variable (following display refresh rate)

### Spatial Partitioning
For multi-kart collision detection, implement grid-based spatial partitioning:
- Grid cell size: 5m x 5m
- Only check collisions between karts in adjacent cells
- Reduces collision checks from O(n²) to O(n) in most cases

### Prediction and Interpolation
```typescript
// Client-side prediction for responsive controls
private predictMovement(deltaTime: number): void {
  const predictedPosition = this.character.position.clone()
    .add(this.velocity.clone().multiplyScalar(deltaTime));
  
  const predictedRotation = this.character.rotation.y + 
    this.angularVelocity * deltaTime;
  
  // Use predictions for camera and visual updates
  this.cameraManager.updateKartCamera(predictedPosition, this.velocity, 
    new Euler(0, predictedRotation, 0));
}

// Network state interpolation for smooth remote kart movement
private interpolateFromNetworkState(remoteState: KartState, deltaTime: number): void {
  const positionError = remoteState.position.clone().sub(this.character.position);
  const rotationError = remoteState.rotation - this.character.rotation.y;
  
  // Gradual correction to avoid teleporting
  this.character.position.add(positionError.multiplyScalar(5 * deltaTime));
  this.character.rotation.y += rotationError * 5 * deltaTime;
}
```

## Tuning Parameters

### Gameplay Feel Adjustments
These parameters can be tweaked for different gameplay experiences:

#### Arcade Style (Default)
- High acceleration (8 m/s²)
- Responsive steering (2.5 rad/s)
- Forgiving drift mechanics (0.85 friction factor)
- Moderate top speed (20 m/s)

#### Simulation Style
- Lower acceleration (5 m/s²)
- Steering dependent on speed (1.5-3.0 rad/s)
- Realistic drift physics (0.7 friction factor)
- Higher top speed (30 m/s)

#### Beginner Friendly
- High acceleration (10 m/s²)
- Very responsive steering (3.0 rad/s)
- Easy drift control (0.9 friction factor)
- Lower top speed (15 m/s)

### Testing and Validation

#### Unit Tests
```typescript
describe('KartController Physics', () => {
  test('acceleration respects speed limits', () => {
    const kart = new KartController(defaultConfig);
    kart.processInput({ throttle: 1, steering: 0, drift: false, boost: false });
    
    // Simulate acceleration for 10 seconds
    for (let i = 0; i < 600; i++) {
      kart.update(1/60);
    }
    
    expect(kart.velocity.length()).toBeLessThanOrEqual(kart.maxSpeed);
  });
  
  test('drift reduces lateral friction', () => {
    const kart = new KartController(defaultConfig);
    // Test drift mechanics...
  });
});
```

#### Integration Tests
- Multi-kart collision scenarios
- Network synchronization accuracy
- Camera smoothness during high-speed maneuvers
- Input responsiveness under various conditions

This physics specification provides a solid foundation for responsive, fun kart racing gameplay while maintaining the technical requirements for networked multiplayer gaming. 