import * as THREE from 'three';
import { tslFn, uniform, texture, instanceIndex, float, vec3, storage, SpriteNodeMaterial, If } from 'three/nodes';

import WebGPU from 'three/addons/capabilities/WebGPU.js';
import WebGL from 'three/addons/capabilities/WebGL.js';
import WebGPURenderer from 'three/addons/renderers/webgpu/WebGPURenderer.js';
import StorageInstancedBufferAttribute from 'three/addons/renderers/common/StorageInstancedBufferAttribute.js';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Stats from 'three/addons/libs/stats.module.js';

import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

const particleCount = 10000;

const gravity = uniform( - .0098 );
const bounce = uniform( .8 );
const friction = uniform( .99 );
const size = uniform( .12 );

let camera, scene, renderer;
let controls, stats;
let computeParticles;

// const timestamps = document.getElementById( 'timestamps' );

init();

function init() {

  if ( WebGPU.isAvailable() === false && WebGL.isWebGL2Available() === false ) {

    document.body.appendChild( WebGPU.getErrorMessage() );

    throw new Error( 'No WebGPU or WebGL2 support' );

  }

  const { innerWidth, innerHeight } = window;

  camera = new THREE.PerspectiveCamera( 50, innerWidth / innerHeight, .1, 1000 );
  camera.position.set( 0, 30, 0 );

  scene = new THREE.Scene();

  // textures

  const textureLoader = new THREE.TextureLoader();
  const map = textureLoader.load( 'assets/textures/circle_02.png' );

  //

  const createBuffer = () => storage( new StorageInstancedBufferAttribute( particleCount, 3 ), 'vec3', particleCount );

  const positionBuffer = createBuffer();
  const velocityBuffer = createBuffer();
  const colorBuffer = createBuffer();

  // compute

  const computeInit = tslFn( () => {

    const position = positionBuffer.element( instanceIndex );
    const color = colorBuffer.element( instanceIndex );

    const randX = instanceIndex.hash();
    const randY = instanceIndex.add( 2 ).hash();
    const randZ = instanceIndex.add( 3 ).hash();

    position.x = randX.mul( 10 ).add( - 5 );
    position.y = 0; // randY.mul( 10 );
    position.z = randZ.mul( 10 ).add( - 5 );

    color.assign( vec3( 1.0, 1.0, 1.0 ) );

  } )().compute( particleCount );

  //

  const computeUpdate = tslFn( () => {

    const position = positionBuffer.element( instanceIndex );
    const velocity = velocityBuffer.element( instanceIndex );

    velocity.addAssign( vec3( 0.00, gravity, 0.00 ) );
    position.addAssign( velocity );

    velocity.mulAssign( friction );

    // floor

    If( position.y.lessThan( 0 ), () => {

      position.y = 0;
      velocity.y = velocity.y.negate().mul( bounce );

      // floor friction

      velocity.x = velocity.x.mul( .9 );
      velocity.z = velocity.z.mul( .9 );

    } );

  } );

  computeParticles = computeUpdate().compute( particleCount );

  // create nodes

  const textureNode = texture( map );

  // create particles

  const particleMaterial = new SpriteNodeMaterial();
  particleMaterial.colorNode = textureNode.mul( colorBuffer.element( instanceIndex ) );
  particleMaterial.positionNode = positionBuffer.toAttribute();
  particleMaterial.scaleNode = size;
  particleMaterial.depthWrite = false;
  particleMaterial.depthTest = true;
  particleMaterial.transparent = true;

  const particles = new THREE.Mesh( new THREE.PlaneGeometry( 1, 1 ), particleMaterial );
  particles.isInstancedMesh = true;
  particles.count = particleCount;
  particles.frustumCulled = false;
  scene.add( particles );

  //

  const helper = new THREE.GridHelper( 60, 40, 0x303030, 0x303030 );
  scene.add( helper );

  const geometry = new THREE.PlaneGeometry( 1000, 1000 );
  geometry.rotateX( - Math.PI / 2 );

  const plane = new THREE.Mesh( geometry, new THREE.MeshBasicMaterial( { visible: false } ) );
  scene.add( plane );

  //

  renderer = new WebGPURenderer( { antialias: true, trackTimestamp: true } );
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );
  renderer.setAnimationLoop( animate );
  // add at the right place based on
  
  document.body.appendChild( renderer.domElement );
  const appElement = document.getElementById('app');
  console.log("appElement", appElement.style.backgroundColor);
  stats = new Stats();
  document.body.appendChild( stats.dom );

  renderer.compute( computeInit );

  controls = new OrbitControls( camera, renderer.domElement );
  controls.minDistance = 5;
  controls.maxDistance = 200;
  controls.target.set( 0, 0, 0 );
  controls.update();

  //

  window.addEventListener( 'resize', onWindowResize );

  // gui

  const gui = new GUI();

  gui.add( gravity, 'value', - .0098, 0, 0.0001 ).name( 'gravity' );
  gui.add( bounce, 'value', .1, 1, 0.01 ).name( 'bounce' );
  gui.add( friction, 'value', .96, .99, 0.01 ).name( 'friction' );
  gui.add( size, 'value', .12, .5, 0.01 ).name( 'size' );

}

function onWindowResize() {

  const { innerWidth, innerHeight } = window;

  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize( innerWidth, innerHeight );

}

async function animate() {

  stats.update();

  await renderer.computeAsync( computeParticles );

  await renderer.renderAsync( scene, camera );

  // throttle the logging

  // if ( renderer.hasFeature( 'timestamp-query' ) ) {

  //   if ( renderer.info.render.calls % 5 === 0 ) {

  //     timestamps.innerHTML = `

  //       Compute ${renderer.info.compute.computeCalls} pass in ${renderer.info.compute.timestamp.toFixed( 6 )}ms<br>
  //       Draw ${renderer.info.render.drawCalls} pass in ${renderer.info.render.timestamp.toFixed( 6 )}ms`;

  //   }

  // } else {

  //   timestamps.innerHTML = 'Timestamp queries not supported';

  // }


}
