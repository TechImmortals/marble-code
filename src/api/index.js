import { STLLoader } from "three/examples/jsm/loaders/STLLoader";

async function getFileServerBasePath() {
    try {
        const response = await fetch('config.json');
        const configData = await response.json();
        return configData.PRODUCTION_BUILD.FILE_SERVER_URL;
    } catch (error) {
        console.error("Error fetching config.json:", error);
        return null;
    }
}

export async function loadModel() {
    try {
        const basePath = await getFileServerBasePath();
        if (!basePath) {
            console.error("Base path not available.");
            return null;
        }

        const url = `${basePath}/Right_Tibia.stl`;
        const url1 = `${basePath}/Right_Femur.stl`;
        const loader = new STLLoader();
        const scene = await loadUrl(url, loader);
        const scene1 = await loadUrl(url1, loader);
        console.log(scene, scene1)
        return {scene, scene1};
    } catch (error) {
        console.error("Error loading model:", error);
        return null;
    }
}

function loadUrl(url, loader) {
    return new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
    });
}
