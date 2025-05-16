// src/STLLoader.js
import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

const Models = ({ file, position, addToScene }) => {
  const meshRef = useRef();

  useEffect(() => {
    const loader = new STLLoader();

    const loadModel = () => {
      loader.load(file, (geometry) => {
        const material = new THREE.MeshNormalMaterial();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(...position);

        addToScene(mesh);
      }, (event) => {
        // Use onProgress callback to get information about the loading progress
        const percentLoaded = (event.loaded / event.total) * 100;
        console.log('Loading:', percentLoaded.toFixed(2) + '%');
      }, (error) => {
        console.error(error);
      });
    };

    loadModel();
  }, [file, position, addToScene]);

  return null;
};

export default Models;
