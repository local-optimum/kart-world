import { Euler, PerspectiveCamera, Raycaster, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { CollisionsManager } from "../collisions/CollisionsManager";
import { remap } from "../helpers/math-helpers";
import { EventHandlerCollection } from "../input/EventHandlerCollection";
import { camValues } from "../tweakpane/blades/cameraFolder";
import { TweakPane } from "../tweakpane/TweakPane";
import { getTweakpaneActive } from "../tweakpane/tweakPaneActivity";

const cameraPanSensitivity = 20;
const scrollZoomSensitivity = 0.1;
const pinchZoomSensitivity = 0.025;

export class CameraManager {
  public readonly camera: PerspectiveCamera;
  private flyCamera: PerspectiveCamera;
  private orbitControls: OrbitControls;
  private isMainCameraActive: boolean = true;

  public initialDistance: number = camValues.initialDistance;
  public minDistance: number = camValues.minDistance;
  public maxDistance: number = camValues.maxDistance;
  public damping: number = camValues.damping;
  public zoomScale: number = camValues.zoomScale;
  public zoomDamping: number = camValues.zoomDamping;

  public initialFOV: number = camValues.initialFOV;
  public maxFOV: number = camValues.maxFOV;
  public minFOV: number = camValues.minFOV;
  public invertFOVMapping: boolean = camValues.invertFOVMapping;
  public fov: number = this.initialFOV;
  private targetFOV: number = this.initialFOV;

  public minPolarAngle: number = Math.PI * 0.25;
  private maxPolarAngle: number = Math.PI * 0.95;

  public distance: number = this.initialDistance;
  public targetDistance: number = this.initialDistance;
  public desiredDistance: number = this.initialDistance;

  private phi: number;
  private targetPhi: number;
  private theta: number;
  private targetTheta: number;

  private target: Vector3 = new Vector3(0, 1.55, 0);
  private hadTarget: boolean = false;

  private rayCaster: Raycaster;

  private eventHandlerCollection: EventHandlerCollection;

  private finalTarget: Vector3 = new Vector3();
  private isLerping: boolean = false;
  private lerpTarget: Vector3 = new Vector3();
  private lerpFactor: number = 0;
  private lerpDuration: number = 2.1;

  private activePointers = new Map<number, { x: number; y: number }>();

  constructor(
    private targetElement: HTMLElement,
    private collisionsManager: CollisionsManager,
    initialPhi = Math.PI / 2,
    initialTheta = -Math.PI / 2,
  ) {
    this.targetElement.style.touchAction = "pinch-zoom";
    this.phi = initialPhi;
    this.targetPhi = this.phi;
    this.theta = initialTheta;
    this.targetTheta = this.theta;

    const aspect = window.innerWidth / window.innerHeight;

    this.camera = new PerspectiveCamera(this.fov, aspect, 0.1, 400);
    this.camera.position.set(0, 1.4, -this.initialDistance);
    this.camera.name = "MainCamera";
    this.flyCamera = new PerspectiveCamera(this.initialFOV, aspect, 0.1, 400);
    this.flyCamera.name = "FlyCamera";
    this.flyCamera.position.copy(this.camera.position);
    this.flyCamera.name = "FlyCamera";

    this.orbitControls = new OrbitControls(this.flyCamera, this.targetElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
    this.orbitControls.enablePan = true;
    this.orbitControls.enabled = false;

    this.rayCaster = new Raycaster();

    this.createEventHandlers();
  }

  private createEventHandlers(): void {
    this.eventHandlerCollection = EventHandlerCollection.create([
      [this.targetElement, "pointerdown", this.onPointerDown.bind(this)],
      [this.targetElement, "gesturestart", this.preventDefaultAndStopPropagation.bind(this)],
      [this.targetElement, "wheel", this.onMouseWheel.bind(this)],
      [this.targetElement, "contextmenu", this.onContextMenu.bind(this)],
      [document, "pointerup", this.onPointerUp.bind(this)],
      [document, "pointercancel", this.onPointerUp.bind(this)],
      [document, "pointermove", this.onPointerMove.bind(this)],
    ]);
  }

  private disposeEventHandlers(): void {
    this.eventHandlerCollection.clear();
  }

  private preventDefaultAndStopPropagation(evt: PointerEvent): void {
    evt.preventDefault();
    evt.stopPropagation();
  }

  public setupTweakPane(tweakPane: TweakPane) {
    tweakPane.setupCamPane(this);
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button === 0 || event.button === 2) {
      // Left or right mouse button

      const pointerInfo = { x: event.clientX, y: event.clientY };
      this.activePointers.set(event.pointerId, pointerInfo);
      document.body.style.cursor = "none";
    }
  }

  private onPointerUp(event: PointerEvent): void {
    const existingPointer = this.activePointers.get(event.pointerId);
    if (existingPointer) {
      this.activePointers.delete(event.pointerId);
      if (this.activePointers.size === 0) {
        document.body.style.cursor = "default";
      }
    }
  }

  private getAveragePointerPositionAndSpread(): { pos: { x: number; y: number }; spread: number } {
    const existingSum = { x: 0, y: 0 };
    this.activePointers.forEach((p) => {
      existingSum.x += p.x;
      existingSum.y += p.y;
    });
    const aX = existingSum.x / this.activePointers.size;
    const aY = existingSum.y / this.activePointers.size;

    let sumOfDistances = 0;
    this.activePointers.forEach((p) => {
      const distance = Math.sqrt((p.x - aX) ** 2 + (p.y - aY) ** 2);
      sumOfDistances += distance;
    });
    return { pos: { x: aX, y: aY }, spread: sumOfDistances / this.activePointers.size };
  }

  private onPointerMove(event: PointerEvent): void {
    if (getTweakpaneActive()) {
      return;
    }

    const existingPointer = this.activePointers.get(event.pointerId);
    if (existingPointer) {
      const previous = this.getAveragePointerPositionAndSpread();

      // Replace the pointer info and recalculate to determine the delta
      existingPointer.x = event.clientX;
      existingPointer.y = event.clientY;

      const latest = this.getAveragePointerPositionAndSpread();

      const sX = latest.pos.x - previous.pos.x;
      const sY = latest.pos.y - previous.pos.y;

      const dx = (sX / this.targetElement.clientWidth) * cameraPanSensitivity;
      const dy = (sY / this.targetElement.clientHeight) * cameraPanSensitivity;

      if (this.activePointers.size > 1) {
        const zoomDelta = latest.spread - previous.spread;
        this.zoom(-zoomDelta * pinchZoomSensitivity);
      }

      this.targetTheta += dx;
      this.targetPhi -= dy;
      this.targetPhi = Math.max(this.minPolarAngle, Math.min(this.maxPolarAngle, this.targetPhi));
      event.preventDefault();
    }
  }

  private onMouseWheel(event: WheelEvent): void {
    if (getTweakpaneActive()) {
      return;
    }
    event.preventDefault();
    const scrollAmount = event.deltaY * this.zoomScale * scrollZoomSensitivity;
    this.zoom(scrollAmount);
  }

  private zoom(delta: number) {
    this.targetDistance += delta;
    this.targetDistance = Math.max(
      this.minDistance,
      Math.min(this.maxDistance, this.targetDistance),
    );
    this.desiredDistance = this.targetDistance;
  }

  private onContextMenu(event: PointerEvent): void {
    event.preventDefault();
  }

  public setTarget(target: Vector3): void {
    if (!this.isLerping) {
      this.target.copy(target);
    } else {
      this.finalTarget.copy(target);
      this.lerpTarget.copy(this.target);
      this.lerpFactor = 0;
    }

    if (!this.hadTarget) {
      this.hadTarget = true;
      this.reverseUpdateFromPositions();
    }
  }

  public setLerpedTarget(target: Vector3, targetDistance: number): void {
    this.isLerping = true;
    this.targetDistance = targetDistance;
    this.desiredDistance = targetDistance;
    this.setTarget(target);
  }

  public updateForKart(kartPosition: Vector3, kartVelocity: Vector3, kartRotation: Euler, isReversing: boolean = false): void {
    // Debug logging
    if (Math.random() < 0.01) { // Log occasionally to avoid spam
      console.log("Camera updateForKart - isReversing:", isReversing);
    }
    
    // Disable manual camera controls when using kart camera
    this.disableManualControls();

    // Calculate speed-responsive camera distance (pull back when accelerating)
    const speed = kartVelocity.length();
    const maxKartSpeed = 60; // Updated to match new doubled maxSpeed (1000 scaled down)
    const speedRatio = Math.min(speed / maxKartSpeed, 1);

    // Dynamic distance: closer when stationary, further back at high speed
    // Start at 6m when stationary, pull back to 12m at max speed for higher speeds
    const baseDistance = 6;
    const maxDistance = 12; // Slightly increased for higher speeds
    // Smoother pull back: use a gentler curve to reduce jarring
    const smoothSpeedRatio = Math.pow(speedRatio, 0.6); // Gentler curve than sqrt
    const dynamicDistance = baseDistance + (maxDistance - baseDistance) * smoothSpeedRatio;

    // Get kart forward direction for camera positioning
    const kartForward = new Vector3(0, 0, 1).applyEuler(kartRotation);

    // Look-ahead prediction: much more conservative to prevent camera swinging
    const lookAheadFactor = 0.08; // Much smaller for stability
    const maxLookAheadDistance = 3; // Cap the look-ahead distance regardless of speed
    const lookAheadPosition = kartPosition.clone();

    if (speed > 1.0) {
      // Use velocity direction for look-ahead when moving, but cap the distance
      const velocityDirection = kartVelocity.clone().normalize();
      const lookAheadDistance = Math.min(lookAheadFactor * speed, maxLookAheadDistance);
      lookAheadPosition.add(velocityDirection.multiplyScalar(lookAheadDistance));
    } else {
      // Use kart facing direction when stationary/slow
      const facingDirection = isReversing ? kartForward.clone().negate() : kartForward.clone();
      lookAheadPosition.add(facingDirection.multiplyScalar(0.5));
    }

    // Height offset: lower when going fast for speed sensation
    const baseHeight = 2.5;
    const speedHeightReduction = speedRatio * 0.3; // Reduced from 0.5 for gentler height changes
    const kartHeightOffset = baseHeight - speedHeightReduction;

    const targetPosition = lookAheadPosition.clone();
    targetPosition.y += kartHeightOffset;

    // Calculate camera position based on movement direction
    const kartForwardNormalized = kartForward.clone().normalize();

    // Position camera behind the direction of movement
    // When reversing, position camera in front of the kart (behind the direction of movement)
    const cameraDirection = isReversing ? kartForwardNormalized.clone() : kartForwardNormalized.clone().negate();
    const cameraOffset = cameraDirection.multiplyScalar(dynamicDistance);
    cameraOffset.y += kartHeightOffset; // Add height offset

    const cameraPosition = kartPosition.clone().add(cameraOffset);

    // Convert to spherical coordinates for the camera system
    const dx = cameraPosition.x - targetPosition.x;
    const dy = cameraPosition.y - targetPosition.y;
    const dz = cameraPosition.z - targetPosition.z;

    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    let theta = Math.atan2(dz, dx);
    const phi = Math.acos(dy / distance);

    // ANGULAR CONSTRAINT: Only constrain during forward driving, allow free rotation when reversing
    const maxSwingAngle = Math.PI / 6; // 30 degrees - reasonable constraint for normal operation

    // Calculate optimal camera angle based on movement direction
    const movementDirection = isReversing ? kartForward.clone().negate() : kartForward.clone();
    const optimalTheta = Math.atan2(movementDirection.z, movementDirection.x) + Math.PI;

    // Calculate how far the desired camera angle deviates from optimal
    let deviationFromOptimal = theta - optimalTheta;

    // Normalize to shortest path
    while (deviationFromOptimal > Math.PI) deviationFromOptimal -= 2 * Math.PI;
    while (deviationFromOptimal < -Math.PI) deviationFromOptimal += 2 * Math.PI;

    // Only apply constraint when NOT reversing - allow complete freedom when reversing
    if (!isReversing) {
      // Forward driving - apply normal constraint to prevent excessive swinging
      deviationFromOptimal = Math.max(-maxSwingAngle, Math.min(maxSwingAngle, deviationFromOptimal));
      if (Math.random() < 0.01) { // Debug occasionally
        console.log("Camera constraint APPLIED - deviation clamped to:", deviationFromOptimal);
      }
    } else {
      if (Math.random() < 0.01) { // Debug occasionally
        console.log("Camera constraint DISABLED - free rotation, deviation:", deviationFromOptimal);
      }
    }
    // When reversing, no constraint - allow camera to rotate wherever it needs to go

    // Apply the constraint (or lack thereof when reversing)
    theta = optimalTheta + deviationFromOptimal;

    // SMOOTH CAMERA MOVEMENTS: Use interpolation instead of direct assignment
    // This prevents jarring camera movements during acceleration/deceleration
    // Made much more responsive to keep up with high-speed rotations and reverse transitions
    const cameraSmoothing = isReversing ? 0.9 : 0.6; // Much more responsive when reversing
    const distanceSmoothing = 0.3; // More responsive distance transitions

    // Calculate shortest path for theta to prevent long-way-around issues
    let thetaDifference = theta - this.targetTheta;
    while (thetaDifference > Math.PI) thetaDifference -= 2 * Math.PI;
    while (thetaDifference < -Math.PI) thetaDifference += 2 * Math.PI;

    // Apply smoothing with shortest path
    this.targetTheta += thetaDifference * cameraSmoothing;
    this.targetPhi += (phi - this.targetPhi) * cameraSmoothing;

    // Smoothly interpolate camera distance
    this.targetDistance += (distance - this.targetDistance) * distanceSmoothing;
    this.desiredDistance = this.targetDistance;

    // Update camera target smoothly
    this.setTarget(targetPosition);
  }

  public reverseUpdateFromPositions(): void {
    const dx = this.camera.position.x - this.target.x;
    const dy = this.camera.position.y - this.target.y;
    const dz = this.camera.position.z - this.target.z;
    this.targetDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    this.distance = this.targetDistance;
    this.desiredDistance = this.targetDistance;
    this.theta = Math.atan2(dz, dx);
    this.targetTheta = this.theta;
    this.phi = Math.acos(dy / this.targetDistance);
    this.targetPhi = this.phi;
    this.recomputeFoV(true);
  }

  public adjustCameraPosition(): void {
    const offsetDistance = 0.5;
    const offset = new Vector3(0, 0, offsetDistance);
    offset.applyEuler(this.camera.rotation);
    const rayOrigin = this.camera.position.clone().add(offset);
    const rayDirection = rayOrigin.sub(this.target.clone()).normalize();

    this.rayCaster.set(this.target.clone(), rayDirection);
    const firstRaycastHit = this.collisionsManager.raycastFirst(this.rayCaster.ray);

    if (firstRaycastHit !== null && firstRaycastHit[0] <= this.desiredDistance) {
      const distanceToCollision = firstRaycastHit[0] - 0.1;
      this.targetDistance = distanceToCollision;
      this.distance = distanceToCollision;
    } else {
      this.targetDistance = this.desiredDistance;
    }
  }

  public dispose() {
    this.disposeEventHandlers();
    this.orbitControls.dispose();
    document.body.style.cursor = "";
  }

  private easeOutExpo(x: number): number {
    return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
  }

  public updateAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.flyCamera.aspect = aspect;
  }

  public recomputeFoV(immediately: boolean = false): void {
    this.targetFOV = remap(
      this.targetDistance,
      this.minDistance,
      this.maxDistance,
      this.invertFOVMapping ? this.minFOV : this.maxFOV,
      this.invertFOVMapping ? this.maxFOV : this.minFOV,
    );
    if (immediately) {
      this.fov = this.targetFOV;
    }
  }

  public isFlyCameraOn(): boolean {
    return this.isMainCameraActive === false && this.orbitControls.enabled === true;
  }

  public toggleFlyCamera(): void {
    this.isMainCameraActive = !this.isMainCameraActive;
    this.orbitControls.enabled = !this.isMainCameraActive;

    if (!this.isMainCameraActive) {
      this.updateAspect(window.innerWidth / window.innerHeight);
      this.flyCamera.position.copy(this.camera.position);
      this.flyCamera.rotation.copy(this.camera.rotation);
      const target = new Vector3();
      this.camera.getWorldDirection(target);
      target.multiplyScalar(this.targetDistance).add(this.camera.position);
      this.orbitControls.target.copy(target);
      this.orbitControls.update();
      this.disableManualControls();
    } else {
      this.enableManualControls();
    }
  }

  get activeCamera(): PerspectiveCamera {
    return this.isMainCameraActive ? this.camera : this.flyCamera;
  }

  public update(): void {
    if (!this.isMainCameraActive) {
      this.orbitControls.update();
      return;
    }
    if (this.isLerping && this.lerpFactor < 1) {
      this.lerpFactor += 0.01 / this.lerpDuration;
      this.lerpFactor = Math.min(1, this.lerpFactor);
      this.target.lerpVectors(this.lerpTarget, this.finalTarget, this.easeOutExpo(this.lerpFactor));
    } else {
      this.adjustCameraPosition();
    }

    this.distance += (this.targetDistance - this.distance) * this.zoomDamping;

    this.theta += (this.targetTheta - this.theta) * this.damping;
    this.phi += (this.targetPhi - this.phi) * this.damping;

    const x = this.target.x + this.distance * Math.sin(this.phi) * Math.cos(this.theta);
    const y = this.target.y + this.distance * Math.cos(this.phi);
    const z = this.target.z + this.distance * Math.sin(this.phi) * Math.sin(this.theta);

    this.recomputeFoV();
    this.fov += (this.targetFOV - this.fov) * this.zoomDamping;
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);

    if (this.isLerping && this.lerpFactor >= 1) {
      this.isLerping = false;
    }
  }

  public hasActiveInput(): boolean {
    // If manual controls are disabled (kart mode), no active input
    if (!this.eventHandlerCollection) {
      return false;
    }
    return this.activePointers.size > 0;
  }

  public enableManualControls(): void {
    if (!this.eventHandlerCollection) {
      this.createEventHandlers();
    }
  }

  public disableManualControls(): void {
    if (this.eventHandlerCollection) {
      this.disposeEventHandlers();
    }
  }
}
