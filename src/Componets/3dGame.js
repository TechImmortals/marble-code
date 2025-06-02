import React from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { DRACOLoader } from 'three/examples/jsm/Addons.js';
import * as RAPIER from '@dimforge/rapier3d-compat';

class Game extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            loadingProgress: 0,
            physicsReady: false,
            startAnimation: false,
            selectedBall: 0,
            followFirstBall: true // Index of the ball to follow
        };

        this.mountRef = React.createRef();
        this.scene = new THREE.Scene();
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.physicsWorld = null;
        this.balls = []; // Array to store ball meshes and physics bodies
        this.ballsPhysics = []; // Array to store ball meshes and physics bodies
        this.gatePhysics = []; // Array to store ball meshes and physics bodies
        this.clock = new THREE.Clock();
        this.dracoLoader = new DRACOLoader();
        this.ballGeometry = null;
        this.ballMaterial = null;
        this.positionArr = [10, 10, 1, 10, 10, 10, 10, 10, 10, 10]
        this.trurrent = []
        this.trackCurve = null;
        this.prevPos = null

        this.dirLight = null;
        this.smoothCameraPosition = new THREE.Vector3();
        this.smoothLookAtTarget = new THREE.Vector3();
        this.lastDirection = new THREE.Vector3(1, 0, 0); // Fallback direction
        this.bool = false
        this.cameraTargetPosition = new THREE.Vector3();
        this.cameraTargetLookAt = new THREE.Vector3();

        this.chaseCam = null;   // second camera
        this.activeCam = null;   // pointer to whichever camera you render
    }

    async componentDidMount() {
        try {
            await RAPIER.init();
            let gravity = new RAPIER.Vector3(0, -9.81, 0);
            this.physicsWorld = new RAPIER.World(gravity);

            this.setupRenderer();
            this.setupCamera();
            this.setupControls();
            this.setupLights();
            this.addImage();

            await this.loadTrack();
            await this.loadBalls();
            this.setupBallPhysics();

            this.animate();
            this.setState({ physicsReady: true });
            this.start()
        } catch (error) {
            console.error('Initialization failed:', error);
        }
    }


    addImage() {
        // High-resolution sphere geometry
        const geometry = new THREE.SphereGeometry(
            500,    // Radius
            120,    // Width segments (increased for high-res texture)
            60,     // Height segments
        );
        geometry.scale(-1, 1, 1); // Flip normals

        // Texture loading with progress
        const textureLoader = new THREE.TextureLoader();
        textureLoader.setCrossOrigin('anonymous'); // For CORS if hosted externally

        const texture = textureLoader.load(
            'NewFinalMRBG.png',
            () => {
                console.log('10K texture loaded');
            },
            (progress) => {
                const percent = Math.round(progress.loaded / progress.total * 100);
                document.getElementById('loading').textContent =
                    `Loading: ${percent}% (${Math.round(progress.loaded / 1024 / 1024)}MB)`;
            },
            (err) => console.error('Texture error:', err)
        );

        // Material configuration
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.FrontSide,
            transparent: true,
            opacity: 1,
            castShadow: false,
            receiveShadow: false,
        });

        // Sphere mesh
        const sphere = new THREE.Mesh(geometry, material);
        this.scene.add(sphere);
    }

    setupRenderer() {
        const width = this.mountRef.current.clientWidth;
        const height = this.mountRef.current.clientHeight;

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance"
        });
        this.renderer.setSize(width, height);
        this.renderer.setClearColor(0x222222);
        this.renderer.shadowMap.enabled = false;
        this.mountRef.current.appendChild(this.renderer.domElement);

        window.addEventListener('resize', this.onWindowResize);
    }

    setupCamera() {
        const width = this.mountRef.current.clientWidth;
        const height = this.mountRef.current.clientHeight;

        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.001, 2500);
        this.camera.position.set(1, 7, -25);
        this.camera.lookAt(7, 7, -25); // Look at ball start position

        // Second, identical PerspectiveCamera for the chase view:
        this.chaseCam = new THREE.PerspectiveCamera(
            75,
            width / height,
            0.001,
            2500
        );
        // start it at the same position:

        // By default render main cam:
        this.activeCam = this.camera;


        this.smoothCameraPosition.copy(this.camera.position);
        this.smoothLookAtTarget.set(7, 7, -25);

        this.chaseCam.position.copy(this.camera.position);
        this.chaseCam.lookAt(this.smoothLookAtTarget);
    }

    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxDistance = 50;
        this.controls.minDistance = 0;
    }

    setupLights() {
        this.scene.add(new THREE.AmbientLight(0xffffff, 10));

        this.dirLight = new THREE.DirectionalLight(0xffffff, 10);
        this.dirLight.position.set(5, 15, -10);
        this.dirLight.castShadow = false;
        this.scene.add(this.dirLight);
        this.ambientLight = new THREE.DirectionalLight(0xffffff, 10);
    }

    async loadTrack() {
        try {
            const loader = new GLTFLoader();
            loader.setDRACOLoader(this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/'));

            const gltf = await loader.loadAsync('/models/track_08.glb',
                progress => this.setState({
                    loadingProgress: (progress.loaded / progress.total) * 50
                })
            );

            const gltfDoor = await loader.loadAsync('/models/Door.glb',
                progress => this.setState({
                    loadingProgress: (progress.loaded / progress.total) * 50
                })
            );

            const gltfTrurrent = await loader.loadAsync('/models/Turret.glb',
                progress => this.setState({
                    loadingProgress: (progress.loaded / progress.total) * 50
                })
            );

            const trurrent = gltfTrurrent.scene;
            trurrent.name = 'gltfTrurrent';
            trurrent.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = false;
                    child.receiveShadow = false
                    console.log(child.name)
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => {
                            mat.side = THREE.DoubleSide;
                            mat.needsUpdate = true;
                        });
                    } else {
                        child.material.side = THREE.DoubleSide;
                        child.material.needsUpdate = true;
                    }
                }
            });
            this.prepareTrackPhysics(trurrent);
            this.scene.add(trurrent)

            const door = gltfDoor.scene;
            console.log(gltfDoor);
            door.name = 'door2006';
            door.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = false;
                    child.receiveShadow = false;
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => {
                            mat.side = THREE.DoubleSide;
                            mat.needsUpdate = true;
                        });
                    } else {
                        child.material.side = THREE.DoubleSide;
                        child.material.needsUpdate = true;
                    }
                }
            });
            this.prepareTrackPhysics(door);
            this.scene.add(door)

            const track = gltf.scene;
            track.name = 'track2006';
            track.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = false;
                    child.receiveShadow = false;
                    if (Array.isArray(child.material)) {
                        child.material.forEach(mat => {
                            mat.side = THREE.DoubleSide;
                            mat.needsUpdate = true;
                        });
                    } else {
                        child.material.side = THREE.DoubleSide;
                        child.material.needsUpdate = true;
                    }
                }
            });
            this.prepareTrackPhysics(track);

            this.scene.add(track);
            this.createTrackCurve();
            this.setState({ loadingProgress: 50 });

        } catch (error) {
            console.error('Failed to load track:', error);
            throw error;
        }
    }

    createTrackCurve(isClosed = false) {
        // ✅ Get the position array from the geometry
        const positionArray = this.trackLine.geometry.attributes.position.array;
        const points = [];

        // ✅ Loop through the array in steps of 3 (x, y, z)
        for (let i = 0; i < positionArray.length; i += 3) {
            const point = new THREE.Vector3(
                positionArray[i],
                positionArray[i + 1],
                positionArray[i + 2]
            );

            // ✅ If trackLine is parented, convert to world space
            if (this.trackLine.parent) {
                this.trackLine.localToWorld(point);
            }

            points.push(point);
        }

        // ✅ Create the CatmullRomCurve3 with the collected points
        this.trackCurve = new THREE.CatmullRomCurve3(points);
        this.trackCurve.closed = isClosed;

        console.log("Track Curve Created: ", this.trackCurve);
    }


    start() {
        this.setState({ startAnimation: true })
    }

    stop() {
        this.setState({ startAnimation: false })
    }

    async prepareTrackPhysics(trackMesh) {
        trackMesh.updateMatrixWorld();

        let processedMeshes = new Set(); // Track processed meshes

        trackMesh.traverse((child) => {

            console.log(child.name)
            if (!child.isMesh || !child.geometry || processedMeshes.has(child.uuid)) return;
            processedMeshes.add(child.uuid); // Mark mesh as processed

            console.log(`Processing: ${child.name}`);

            if (child.name === "track_line") {
                console.log(child)
                this.trackLine = child
                child.visible = false;
            }


            child.updateMatrixWorld(true);
            const matrix = child.matrixWorld;
            const geo = child.geometry;

            if (!geo.attributes || !geo.attributes.position) {
                console.warn(`Skipping ${child.name}, missing position attribute`);
                return;
            }

            // Extract positions
            const posAttr = geo.attributes.position;
            let indices = geo.index ? Array.from(geo.index.array) : [];

            let vertices = [];
            for (let i = 0; i < posAttr.count; i++) {
                const v = new THREE.Vector3()
                    .fromBufferAttribute(posAttr, i)
                    .applyMatrix4(matrix);
                vertices.push(v.x, v.y, v.z);
            }

            // Ensure valid indices
            if (indices.some(i => i >= vertices.length / 3)) {
                console.error(`Invalid geometry indices in ${child.name}`);
                return;
            }


            // Create physics collider
            const trackCollider = RAPIER.ColliderDesc.trimesh(vertices, indices)
                .setRestitution(0.0)
                .setFriction(0.05);
            let BodyType = RAPIER.RigidBodyDesc.fixed();
            let rigidBody = this.physicsWorld.createRigidBody(BodyType);

            if (child.name.includes('2_1')) {
                const BodyType = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(child.position.x, child.position.y, child.position.z);
                rigidBody = this.physicsWorld.createRigidBody(BodyType);
                this.gatePhysics.push({
                    mesh: child,
                    body: rigidBody,
                    // debugBody: trimeshMesh
                });
            }
            this.physicsWorld.createCollider(trackCollider, rigidBody);

            if (child.name === 'cards') {
                child.rendererOrder = 1
                child.material = new THREE.MeshStandardMaterial({
                    map: child.material.map,
                    color: child.material.color,
                    side: THREE.DoubleSide,
                    transparent: true,
                    roughness: 1.0,
                    metalness: 0.0,
                    alphaTest: 0.5
                })
                child.material.needsUpdate = true;
            }
            if (child.name.includes('UMesh_Symex7003')) {

                this.trurrent.push({
                    mesh: child,
                    body: rigidBody
                });
            }
        });

        console.log("✅ Finished processing all meshes for physics.");
    }

    saveToFile = (filename, data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    async loadBalls() {
        try {
            const loader = new GLTFLoader();
            for (let i = 0; i < 10; i++) {
                console.log(`/models/${i}.glb`)
                const gltf = await loader.loadAsync(
                    `/models/${i + 1}.glb`,
                    progress => this.setState({
                        loadingProgress: 50 + (progress.loaded / progress.total) * 50
                    })
                );
                gltf.scene.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = false;
                        child.receiveShadow = false;
                        child.scale.multiplyScalar(0.5);
                        this.balls.push(child)
                        this.scene.add(child)
                    }
                    else {
                        child.castShadow = false;
                        child.receiveShadow = false;
                    }
                });
            }
        } catch (error) {
            console.error('Failed to load balls:', error);
            throw error;
        }
    }

    setupBallPhysics() {
        const ballRadius = 0.1275;
        let ballZpos = 0;
        let ballXpos = 0;

        this.balls.forEach((ball, index) => {
            const startPos = new THREE.Vector3(3, 6.92, -24.55);

            // Calculate positions
            const ballpositionx = startPos.x - 0.5 + ballXpos;
            const ballpositiony = startPos.y - 0.15;
            const ballpositionz = startPos.z - 0.75 + ballZpos;

            ball.position.set(ballpositionx, ballpositiony, ballpositionz);

            // Create physics body
            const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
                .setTranslation(ballpositionx, ballpositiony, ballpositionz)
                .setCcdEnabled(true);

            const body = this.physicsWorld.createRigidBody(bodyDesc);
            const collider = RAPIER.ColliderDesc.ball(ballRadius)
                .setRestitution(0.0)
                .setFriction(0.05)
                .setDensity(15);
            this.physicsWorld.createCollider(collider, body);

            // OPTIONAL: Visualize a wireframe sphere for debugging
            const sphereGeometry = new THREE.SphereGeometry(ballRadius, 16, 16); // Adjust segments if needed
            const wireframeMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
            const debugSphere = new THREE.Mesh(sphereGeometry, wireframeMaterial);
            debugSphere.position.copy(ball.position);
            // this.scene.add(debugSphere);

            // Store reference
            this.ballsPhysics.push({
                mesh: ball,
                body: body,
                targetPosition: this.positionArr[index],
                // debugMesh: debugSphere
            });

            // Update positioning counters
            ballZpos += 0.35;
            if (index === 4) {
                ballXpos += 0.3;
                ballZpos = 0;
            }
        });

    }

    animate = () => {
        setTimeout(this.animate, 1000 / 60);
        const delta = this.clock.getDelta();

        if (this.dirLight) {
            this.dirLight.position.copy(this.camera.position);
            this.dirLight.target.position.copy(this.smoothLookAtTarget);
            this.dirLight.target.updateMatrixWorld();
        }

        if (this.physicsWorld && this.state.physicsReady && this.state.startAnimation) {

            // 1. Apply CONTINUOUS FORCE (mass-dependent acceleration)
            this.ballsPhysics.forEach((ball, index) => {
                if (!ball.body || typeof ball.body.translation !== "function") {
                    console.warn("Ball physics body is undefined or missing translation method", ball);
                    return;
                }

                // Get current velocity
                const velocity = ball.body.linvel();
                const velVector = new THREE.Vector3(velocity.x, velocity.y, velocity.z);
                const direction = velVector.clone().normalize();

                if (direction.lengthSq() > 0) { // Ensure movement is occurring
                    const desiredSpeed = 5; // Target velocity magnitude (adjust as needed)
                    const velocity = ball.body.linvel(); // Current linear velocity

                    // Compute current horizontal speed (ignore y-axis)
                    const currentSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
                    // Assuming you have references to cube33, cube31, and the ball
                    const box33 = new THREE.Box3().setFromObject(this.scene.getObjectByName('Cube033'));
                    const box31 = new THREE.Box3().setFromObject(this.scene.getObjectByName('Cube031'));
                    const ballPosition = ball.body.translation();

                    // Check if the ball is inside either bounding box
                    const isInsideCube33 = box33.containsPoint(ballPosition);
                    const isInsideCube31 = box31.containsPoint(ballPosition);

                    if ((!isInsideCube33 && !isInsideCube31)) {
                        // Boost slower balls
                        let forceMagnitude = 0.0005;
                        let pos = 10 - ball.targetPosition;
                        const positionBoost = pos * 0.0002;
                        forceMagnitude += positionBoost;

                        const force = new RAPIER.Vector3(
                            direction.x * forceMagnitude,
                            0,
                            direction.z * forceMagnitude
                        );
                        ball.body.addForce(force);
                    }
                    else {
                        if (Math.abs(velocity.x) > 0.001 || Math.abs(velocity.y) > 0.001 || Math.abs(velocity.z) > 0.001) {
                            this.scene.remove(this.dirLight);
                            this.ambientLight.target.position.copy(this.smoothLookAtTarget);
                            this.ambientLight.position.set(this.camera.position.x - 3, this.camera.position.y + 5, this.camera.position.z - 5);
                            this.ambientLight.target.updateMatrixWorld();
                            this.scene.add(this.ambientLight);
                            const force = new RAPIER.Vector3(0.01, 0, 0);
                            ball.body.addForce(force);
                        }
                    }
                }
            });

            // Update physics
            this.physicsWorld.step();

            // Update ball positions
            this.ballsPhysics.forEach((ball, index) => {
                if (!ball.body || typeof ball.body.translation !== "function") {
                    console.warn("Ball physics body is undefined or missing translation method", ball);
                    return;
                }
                const velocity = ball.body.linvel();
                if ((Math.abs(velocity.x) > 0.01 || Math.abs(velocity.y) > 0.01 || Math.abs(velocity.z) > 0.01) || ball.body.translation().y < -5) {
                    const pos = ball.body.translation();
                    ball.mesh.position.set(pos.x, pos.y, pos.z);
                    if (pos.y < -30) { // If fell through track
                        const startPos = new THREE.Vector3(
                            2.957737445831299,
                            -0.22568076848983765,
                            -24.557401657104492
                        );
                        ball.body.setTranslation(new RAPIER.Vector3(
                            startPos.x,
                            startPos.y + 5,
                            startPos.z
                        ), true);
                    }
                    // ball.debugMesh.position.set(pos.x, pos.y, pos.z);

                    const speed = Math.sqrt(velocity.x ** 2 + velocity.z ** 2); // Only consider horizontal speed

                    if (speed > 0.0) {
                        // Compute axis of rotation: perpendicular to velocity and up vector
                        const up = new THREE.Vector3(0, 1, 0); // Assuming ball rolls on XZ plane
                        const rollAxis = new THREE.Vector3().crossVectors(up, velocity).normalize();

                        // Compute angle of rotation: distance moved divided by radius
                        const distance = (speed * delta) / 2;
                        const angle = distance / 0.125; // ballRadius is the radius of the ball

                        // Rotate the ball's mesh
                        ball.mesh.rotateOnWorldAxis(rollAxis, angle);
                        // ball.debugMesh.rotateOnWorldAxis(rollAxis, angle);
                    }
                }
            });

            if (this.trackCurve && this.ballsPhysics.length) {
                this.controls.enabled = false;

                // 1) Detect stationary ball below y = -3
                if (!this.stationaryBall && !this.isAnimatingUp) {
                    for (const ball of this.ballsPhysics) {
                        const pos = ball.body.translation();

                        // Only proceed if the ball's Y position is below -3
                        if (pos.y < -15) {
                            const lv = ball.body.linvel();
                            const speedSq = lv.x * lv.x + lv.y * lv.y + lv.z * lv.z;

                            // Mark it as stationary if speed is near zero
                            if (speedSq < 0.000001) {
                                this.stationaryBall = new THREE.Vector3(pos.x, pos.y, pos.z);
                                break;
                            }
                        }
                    }
                }

                // 2) Initialize the upward animation
                if (this.stationaryBall && !this.isAnimatingUp) {
                    this.originalStationaryBall = this.stationaryBall.clone();
                    this.targetPosition = this.originalStationaryBall.clone().add(new THREE.Vector3(0, 5, 0));
                    this.startCameraPosition = this.camera.position.clone();
                    this.isAnimatingUp = true;
                    this.animationProgress = 0;
                    this.animationStartTime = performance.now();
                }

                // 3) Handle upward animation with sine easing
                if (this.isAnimatingUp) {
                    if (this.animationProgress < 1) {
                        this.animationProgress += 0.006;
                        const easedProgress = Math.sin((this.animationProgress * Math.PI) / 2);

                        const newCameraPos = new THREE.Vector3().lerpVectors(
                            this.startCameraPosition,
                            this.targetPosition,
                            easedProgress
                        );
                        this.camera.position.copy(newCameraPos);
                        this.camera.lookAt(this.originalStationaryBall);
                        this.controls.target.copy(this.originalStationaryBall);
                    }
                    else {
                        this.isAnimatingUp = false;
                    }
                } else {
                    // 4) 60s hold before re-checking velocity
                    const now = performance.now();
                    const holdElapsed = (now - this.animationStartTime) / 1000;

                    if (holdElapsed < 60) {
                        if (this.targetPosition) {
                            this.camera.position.copy(this.targetPosition);
                            this.camera.lookAt(this.originalStationaryBall);
                            this.controls.target.copy(this.originalStationaryBall);
                        }
                    } else {
                        // After 60s: resume velocity check & spline-follow
                        let isStillStationary = false;

                        for (const ball of this.ballsPhysics) {
                            const pos = ball.body.translation();
                            if (pos.y < -3) { // Ensure the ball is still in the zone
                                const lv = ball.body.linvel();
                                const speedSq = lv.x * lv.x + lv.y * lv.y + lv.z * lv.z;
                                if (speedSq < 0.0001) {
                                    isStillStationary = true;
                                    break;
                                }
                            }
                        }

                        // ball moved → reset and go back to spline-follow
                        this.stationaryBall = null;
                        this.originalStationaryBall = null;
                        this.targetPosition = null;

                        const leadingBall = this.getLeadingBall()[0];
                        if (!leadingBall) return;

                        const bPos = leadingBall.body.translation();
                        const ballPos = new THREE.Vector3(bPos.x, bPos.y, bPos.z);

                        let movementDir = new THREE.Vector3(0, 0, 1);
                        if (this.prevBallPos) {
                            movementDir.copy(ballPos).sub(this.prevBallPos).normalize();
                        }
                        this.prevBallPos = ballPos.clone();

                        const { closestPoint, tangent } = this.getClosestSplinePoint(ballPos, movementDir);
                        closestPoint.add(new THREE.Vector3(0, 0.5, 0));

                        this.smoothCameraPosition.lerp(closestPoint, 0.02);
                        const lookTarget = closestPoint.clone()
                            .add(movementDir)
                            .add(new THREE.Vector3(0, -0.5, 0));
                        this.smoothLookAtTarget.lerp(lookTarget, 0.02);

                        // 🎯 Compute the binormal and normal to represent the track's orientation
                        const binormal = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
                        const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();

                        // 🎯 Apply the tilt based on the track's normal vector
                        // const tiltAngle = 0.1; // You can adjust this value for stronger tilt
                        // const tiltedUp = new THREE.Vector3()
                        //     .copy(normal)
                        //     .applyAxisAngle(tangent, tiltAngle)
                        //     .normalize();

                        // // 🎯 Smooth transition of the camera's up vector for realistic motion
                        // this.camera.up.lerp(tiltedUp, 0.05);
                        this.camera.position.copy(this.smoothCameraPosition);
                        this.camera.lookAt(this.smoothLookAtTarget);
                        this.controls.target.copy(this.smoothLookAtTarget);
                    }
                }
                console.log(this.camera.position, this.controls.target)
            }

        }
        const door = this.scene.getObjectByName('2_1');

        if (door && door.userData.startY === undefined) {
            // Record the initial (rest) Y position, should be 0 in your case
            door.userData.startY = door.position.y;
        }

        if (door) {
            // Compute a value that goes 0 → –1 → 0 over time
            // Math.sin() goes –1 → +1; Math.abs() makes it 0 → 1 → 0; negate to get 0 → –1 → 0
            const animValue = -Math.abs(Math.sin(this.clock.getElapsedTime()));
            // Scale by the amplitude (1 unit) and add to startY
            const newY = door.userData.startY + (animValue * 1);

            // Apply to Three.js mesh
            door.position.y = newY;

            // Sync each Rapier body
            this.gatePhysics.forEach((gate) => {
                if (gate.body) {
                    const newYPos = newY + 2.75;
                    const t = gate.body.translation();
                    // Set the door's body to the exact same Y
                    gate.body.setTranslation(
                        new RAPIER.Vector3(t.x, newYPos, t.z),
                        true
                    );
                    // gate.debugBody.position.copy(new THREE.Vector3(t.x, newYPos, t.z)); // Update debug mesh position
                }
            });
        }


        if (this.trurrent.length > 0) {
            this.rotateBodiesAroundY(this.trurrent, Math.PI / 16);
        }
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    rotateBodiesAroundY(bodies, angleRad) {
        bodies.forEach(obj => {
            const { body, mesh } = obj;
            const quaternion = new THREE.Quaternion();
            quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angleRad);
            mesh.quaternion.multiply(quaternion);
            // 5. Sync Rapier physics body
            if (body) {
                body.setTranslation(mesh.position, true);
                body.setRotation(
                    {
                        x: mesh.quaternion.x,
                        y: mesh.quaternion.y,
                        z: mesh.quaternion.z,
                        w: mesh.quaternion.w
                    },
                    true
                );
            }
        });
    }

    // ————————————————————————————————
    // 1) Modified getClosestSplinePoint:
    getClosestSplinePoint(targetPosition, forwardDir) {
        if (!this.trackCurve) {
            return {
                closestPoint: targetPosition.clone(),
                secondPoint: targetPosition.clone(),
                tangent: new THREE.Vector3(0, 0, 1),
                t0: 0,
                t1: 0
            };
        }

        // Sample the curve densely
        const divisions = 500;
        const samples = this.trackCurve.getSpacedPoints(divisions);
        const length = this.trackCurve.getLength();

        // Find the index of the sample closest to the ball
        let closestIndex = 0, minDist2 = Infinity, tmp = new THREE.Vector3();
        for (let i = 0; i <= divisions; i++) {
            tmp.copy(samples[i]);
            const d2 = tmp.distanceToSquared(targetPosition);
            if (d2 < minDist2) {
                minDist2 = d2;
                closestIndex = i;
            }
        }

        // Parametric t on the curve and its tangent
        const t0 = closestIndex / divisions;
        const splineTangent = this.trackCurve.getTangent(t0).normalize();

        // Determine sign: +1 if ballVel points roughly along the splineTangent, else −1
        const sign = forwardDir
            ? (splineTangent.dot(forwardDir) >= 0 ? 1 : -1)
            : 1;

        // Compute how many samples ≈ 0.5 world-units ahead
        const step = Math.ceil((0.5 / length) * divisions);

        // Pick the next sample index in the ball’s forward direction (wrap on closed curves)
        let secondIndex = closestIndex + sign * step;
        secondIndex = ((secondIndex % (divisions + 1)) + (divisions + 1)) % (divisions + 1);
        const t1 = secondIndex / divisions;

        // Grab the two world-space points
        const closestPoint = samples[closestIndex].clone();
        const secondPoint = samples[secondIndex].clone();

        return { closestPoint, secondPoint, tangent: splineTangent, t0, t1 };
    }


    getLeadingBall(count = 1) {
        if (this.ballsPhysics.length === 0) return [];

        // Calculate average movement direction of all balls
        const avgDirection = new THREE.Vector3();
        this.ballsPhysics.forEach(ball => {
            const lv = ball.body.linvel();
            avgDirection.add(new THREE.Vector3(lv.x, lv.y, lv.z));
        });
        avgDirection.normalize();

        // Create orthogonal basis for progress calculation
        const referenceDir = avgDirection.clone().normalize();
        const rightDir = new THREE.Vector3(0, 1, 0).cross(referenceDir).normalize();
        const forwardPlaneNormal = referenceDir.clone().cross(rightDir).normalize();

        const scored = this.ballsPhysics.map(ball => {
            const p = ball.body.translation();
            const pos = new THREE.Vector3(p.x, p.y, p.z);
            const lv = ball.body.linvel();
            const vel = new THREE.Vector3(lv.x, lv.y, lv.z);

            // Calculate forward component (projection onto average direction)
            const forwardProgress = pos.dot(referenceDir);

            // Calculate velocity alignment score (0-1)
            const velNorm = vel.length();
            const velAlignment = velNorm > 0 ? vel.dot(referenceDir) / velNorm : 0;

            // Calculate lateral deviation penalty
            const lateralVector = pos.clone().sub(referenceDir.clone().multiplyScalar(forwardProgress));
            const lateralPenalty = -lateralVector.length() * 0.1;

            // Calculate pack position bonus (being ahead of the average)
            const avgPos = new THREE.Vector3();
            this.ballsPhysics.forEach(b => {
                const bp = b.body.translation();
                avgPos.add(new THREE.Vector3(bp.x, bp.y, bp.z));
            });
            avgPos.divideScalar(this.ballsPhysics.length);
            const packBonus = pos.dot(referenceDir) > avgPos.dot(referenceDir) ? 0.2 : -0.1;

            // Combined score with weighted factors
            const score = forwardProgress +
                (velAlignment * velNorm * 0.2) +
                lateralPenalty +
                packBonus;

            return { ball, score };
        });

        if (!this.state.followFirstBall && this.state.selectedBall !== undefined) {
            console.log(this.ballsPhysics[this.state.selectedBall])
            return [this.ballsPhysics[this.state.selectedBall]];
        }

        return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, count)
            .map(item => item.ball);
    }


    onWindowResize = () => {
        const width = this.mountRef.current.clientWidth;
        const height = this.mountRef.current.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    componentWillUnmount() {
        this.stop()
        window.removeEventListener('resize', this.onWindowResize);
        cancelAnimationFrame(this.animate);

        // Cleanup Three.js objects
        this.scene.traverse(child => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });


        // Cleanup physics
        if (this.physicsWorld) {
            this.physicsWorld.free();
        }
    }

    render() {
        return (
            <div style={{
                width: '100vw',
                height: '100vh',
                position: 'relative'
            }}>
                {!this.state.physicsReady && (
                    <div style={{
                        position: 'absolute',
                        top: '20px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        color: 'white',
                        fontFamily: 'Arial'
                    }}>
                        Loading: {Math.round(this.state.loadingProgress)}%
                    </div>
                )}
                {/* Overlay: pick a ball index and control camera mode */}
                <div style={{
                    position: 'absolute',
                    top: 10, right: 10,
                    background: 'rgba(0,0,0,0.5)',
                    color: 'white',
                    padding: '8px',
                    borderRadius: '4px',
                    zIndex: 10
                }}>
                    <div>
                        Follow ball:
                        <select
                            value={this.state.selectedBall}
                            onChange={e => this.setState({ selectedBall: +e.target.value, followFirstBall: false })}
                            style={{ marginLeft: 8 }}
                        >
                            {this.ballsPhysics.map((_, i) =>
                                <option key={i} value={i}>{i + 1}</option>
                            )}
                        </select>
                    </div>
                    {/* Follow first ball button */}
                    <div style={{ marginTop: '8px' }}>
                        <button
                            onClick={() => this.setState({ selectedBall: 0, followFirstBall: true })}
                            style={{
                                padding: '4px 8px',
                                backgroundColor: '#2196f3',
                                border: 'none',
                                color: 'white',
                                borderRadius: '4px',
                                cursor: 'pointer'
                            }}
                        >
                            Follow First Ball
                        </button>
                    </div>
                </div>

                <div ref={this.mountRef} style={{ width: '100%', height: '100%' }} />
            </div>
        );
    }
}

export default Game;