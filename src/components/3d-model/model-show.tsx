"use client"

import type React from "react"

import { useEffect, useState, useRef } from "react"
import { Canvas, useThree } from "@react-three/fiber"
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader"
import { Stage, OrbitControls } from "@react-three/drei"
import type { Group } from "three"
import * as THREE from "three"
import { Button } from "~/components/shadcn/ui/button"
import clsx from "clsx"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"
const Model = ({
    url,
    setLoadingProgress,
    controlsRef,
}: {
    url: string
    setLoadingProgress: (progress: number) => void
    controlsRef: React.MutableRefObject<OrbitControlsImpl | null>
}) => {
    const [model, setModel] = useState<Group | null>(null)
    const { camera } = useThree()

    useEffect(() => {
        const loader = new OBJLoader()

        loader.load(
            url,
            (object: Group) => {
                const box = new THREE.Box3().setFromObject(object)
                const center = box.getCenter(new THREE.Vector3())
                const size = box.getSize(new THREE.Vector3())

                object.position.sub(center)
                object.position.set(0, 0, 0)

                const maxDim = Math.max(size.x, size.y, size.z)
                let cameraDistance = maxDim * 2 // Default fallback

                // Check if camera is PerspectiveCamera before accessing fov
                if (camera instanceof THREE.PerspectiveCamera) {
                    const fov = camera.fov * (Math.PI / 180)
                    cameraDistance = Math.abs(maxDim / Math.sin(fov / 2)) * 1.5
                }

                camera.position.set(cameraDistance, cameraDistance * 0.5, cameraDistance)
                camera.lookAt(0, 0, 0)

                if (controlsRef.current) {
                    controlsRef.current.minDistance = cameraDistance * 0.3
                    controlsRef.current.maxDistance = cameraDistance * 2.5
                    controlsRef.current.target.set(0, 0, 0)
                    controlsRef.current.update()
                }

                setModel(object)
                setLoadingProgress(100)
            },
            (xhr) => {
                const progress = xhr.total > 0 ? (xhr.loaded / xhr.total) * 100 : 0
                setLoadingProgress(progress)
            },
            (error) => {
                console.error("An error happened", error)
                setLoadingProgress(0)
            },
        )
    }, [url, setLoadingProgress, camera, controlsRef])

    if (!model) return null

    return <primitive object={model} />
}

const ModelLoader = ({ url, setLoadingProgress }: { url: string; setLoadingProgress: (progress: number) => void }) => {
    const controlsRef = useRef<OrbitControlsImpl>(null)

    return (
        <Canvas camera={{ fov: 45, position: [0, 0, 5] }} className="avatar relative h-full w-full">
            <color attach="background" args={["#E2DFD2"]} />
            <OrbitControls
                ref={controlsRef}
                enableZoom={true}
                zoomSpeed={0.3}
                zoomToCursor={false}
                minDistance={1}
                maxDistance={50}
                enablePan={true}
                enableRotate={true}
                rotateSpeed={0.5}
                panSpeed={0.5}
            />
            <Stage intensity={1} environment="city">
                <Model url={url} setLoadingProgress={setLoadingProgress} controlsRef={controlsRef} />
            </Stage>
        </Canvas>
    )
}

const ShowThreeDModel = ({ url, blur }: { url: string; blur?: boolean }) => {
    const [loader, setLoader] = useState(false)
    const [loadingProgress, setLoadingProgress] = useState(0)

    return (
        <div className={clsx("h-full w-full avatar", { "blur-lg": blur })}>
            {loader ? (
                <>
                    <ModelLoader url={url} setLoadingProgress={setLoadingProgress} />
                    {loadingProgress < 100 && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 text-white">
                            <div className="text-center">
                                <div className="mb-2 text-2xl font-bold">Loading...</div>
                                <div className="text-xl">{Math.round(loadingProgress)}%</div>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div className="flex w-full flex-col items-center">
                    <Button className="flex h-full w-full flex-col items-center justify-center" onClick={() => setLoader(true)}>
                        Load 3D Model
                    </Button>
                </div>
            )}
        </div>
    )
}

export default ShowThreeDModel
