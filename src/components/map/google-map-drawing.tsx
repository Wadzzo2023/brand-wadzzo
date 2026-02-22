'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '~/components/shadcn/ui/button';
import { Card } from '~/components/shadcn/ui/card';
import { Square, Circle, Pen, X } from 'lucide-react';

interface GoogleMapDrawingProps {
    onSelectionChange?: (feature: GeoJSON.Feature | null) => void;
    onClose?: () => void;
    mapElement?: HTMLElement | null;
}

type DrawingMode = 'polygon' | 'rectangle' | 'circle' | null;

interface Point {
    lat: number;
    lng: number;
    x: number;
    y: number;
}

// Helper function to calculate rectangle corners from two diagonal points
const getRectangleCorners = (p1: Point, p2: Point): Point[] => {
    return [
        { ...p1 }, // top-left
        { lat: p1.lat, lng: p2.lng, x: p2.x, y: p1.y }, // top-right
        { ...p2 }, // bottom-right
        { lat: p2.lat, lng: p1.lng, x: p1.x, y: p2.y }, // bottom-left
    ];
};

// Helper function to get mode-specific instructions
const getModeInstructions = (mode: DrawingMode, pointCount: number): string => {
    if (!mode) return 'Select a drawing tool to begin';
    if (mode === 'polygon') {
        return pointCount === 0 ? 'Click to add points' : 'Click to add more points, double-click to finish';
    }
    if (mode === 'rectangle') {
        return pointCount === 0 ? 'Click top-left corner' : 'Click bottom-right corner';
    }
    if (mode === 'circle') {
        return pointCount === 0 ? 'Click center point' : 'Click edge to set radius';
    }
    return '';
};

export function GoogleMapDrawing({ onSelectionChange, mapElement, onClose }: GoogleMapDrawingProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [activeMode, setActiveMode] = useState<DrawingMode>(null);
    const [points, setPoints] = useState<Point[]>([]);
    const [mousePos, setMousePos] = useState<Point | null>(null);
    const [currentFeature, setCurrentFeature] = useState<GeoJSON.Feature | null>(null);
    const canvasCoordsToLatlng = (x: number, y: number): { lat: number; lng: number } | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        const lng = (x / canvas.width) * 360 - 180;
        const lat = 90 - (y / canvas.height) * 180;

        return { lat, lng };
    };

    // Redraw canvas with improved visuals
    const redrawCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (points.length > 0) {
            // Draw shape based on mode
            if (activeMode === 'polygon') {
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = 'rgba(65, 189, 40, 0.5)'; // green
                ctx.strokeStyle = 'rgb(65, 189, 40)';
                ctx.lineWidth = 2;

                const firstPoint = points[0];
                if (firstPoint) {
                    ctx.beginPath();
                    ctx.moveTo(firstPoint.x, firstPoint.y);
                    for (let i = 1; i < points.length; i++) {
                        const point = points[i];
                        if (point) ctx.lineTo(point.x, point.y);
                    }
                    // Draw preview line to mouse if available
                    if (mousePos && points.length > 1) {
                        ctx.lineTo(mousePos.x, mousePos.y);
                    }
                    if (points.length > 2) {
                        ctx.closePath();
                    }
                    ctx.fill();
                    ctx.globalAlpha = 1;
                    ctx.stroke();
                }
            } else if (activeMode === 'rectangle') {
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = 'rgba(65, 189, 40, 0.5)'; // green
                ctx.strokeStyle = 'rgb(65, 189, 40)';
                ctx.lineWidth = 2;

                if (points.length === 1 && mousePos) {
                    // Draw preview rectangle
                    const corners = getRectangleCorners(points[0], mousePos);
                    ctx.beginPath();
                    ctx.moveTo(corners[0].x, corners[0].y);
                    for (let i = 1; i < corners.length; i++) {
                        ctx.lineTo(corners[i].x, corners[i].y);
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.globalAlpha = 1;
                    ctx.stroke();
                } else if (points.length === 2) {
                    // Draw final rectangle
                    const corners = getRectangleCorners(points[0], points[1]);
                    ctx.beginPath();
                    ctx.moveTo(corners[0].x, corners[0].y);
                    for (let i = 1; i < corners.length; i++) {
                        ctx.lineTo(corners[i].x, corners[i].y);
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.globalAlpha = 1;
                    ctx.stroke();
                }
            } else if (activeMode === 'circle') {
                ctx.globalAlpha = 0.3;
                ctx.fillStyle = 'rgba(65, 189, 40, 0.5)'; // green
                ctx.strokeStyle = 'rgb(65, 189, 40)';
                ctx.lineWidth = 2;

                const startPoint = points[0];
                if (startPoint) {
                    let radius = 0;
                    if (points.length > 1) {
                        const lastPoint = points[points.length - 1];
                        radius = Math.sqrt(
                            Math.pow(lastPoint.x - startPoint.x, 2) + Math.pow(lastPoint.y - startPoint.y, 2)
                        );
                    } else if (mousePos) {
                        // Preview with mouse position
                        radius = Math.sqrt(
                            Math.pow(mousePos.x - startPoint.x, 2) + Math.pow(mousePos.y - startPoint.y, 2)
                        );
                    }
                    ctx.beginPath();
                    ctx.arc(startPoint.x, startPoint.y, radius, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                    ctx.stroke();
                }
            }

            // Draw point markers (circles at each click point)
            ctx.globalAlpha = 1;
            ctx.fillStyle = 'rgb(255, 255, 255)';
            ctx.strokeStyle = 'rgb(0, 0, 0)';
            ctx.lineWidth = 2;
            const pointRadius = 6;

            for (const point of points) {
                ctx.beginPath();
                ctx.arc(point.x, point.y, pointRadius, 0, 2 * Math.PI);
                ctx.fill();
                ctx.stroke();
            }

            // Draw center dot for each point
            ctx.fillStyle = 'rgb(0, 0, 0)';
            for (const point of points) {
                ctx.beginPath();
                ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
    }, [points, activeMode, mousePos]);

    // Initialize canvas and get map reference
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !mapElement) return;

        // Set canvas size to match map
        const rect = mapElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        // Listen for map changes
        const observer = new ResizeObserver(() => {
            const newRect = mapElement.getBoundingClientRect();
            canvas.width = newRect.width;
            canvas.height = newRect.height;
            redrawCanvas();
        });

        observer.observe(mapElement);
        return () => observer.disconnect();
    }, [mapElement, redrawCanvas]);

    // Handle canvas click
    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas || !activeMode) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const latlng = canvasCoordsToLatlng(x, y);
        if (!latlng) return;

        const newPoint: Point = { ...latlng, x, y };

        if (activeMode === 'polygon') {
            setPoints([...points, newPoint]);
        } else if (activeMode === 'rectangle') {
            if (points.length < 2) {
                setPoints([...points, newPoint]);
            } else {
                setPoints([newPoint]);
            }
        } else if (activeMode === 'circle') {
            if (points.length === 0) {
                setPoints([newPoint]);
            } else {
                setPoints([...points, newPoint]);
            }
        }
    };

    // Handle canvas mouse move for live preview
    const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!activeMode || points.length === 0) {
            setMousePos(null);
            return;
        }

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const latlng = canvasCoordsToLatlng(x, y);
        if (latlng) {
            setMousePos({ ...latlng, x, y });
        }
    };

    // Handle canvas mouse leave to clear preview
    const handleCanvasMouseLeave = () => {
        setMousePos(null);
    };

    // Update canvas when points change
    useEffect(() => {
        redrawCanvas();

        // Create and emit GeoJSON feature for rectangle (when 2 points exist)
        if (activeMode === 'rectangle' && points.length === 2) {
            const corners = getRectangleCorners(points[0], points[1]);
            const coords = corners.map(p => [p.lng, p.lat] as [number, number]);
            coords.push([...coords[0]]); // Close the polygon

            const feature: GeoJSON.Feature = {
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'Polygon',
                    coordinates: [coords],
                },
            };

            try {
                onSelectionChange?.(feature);
                setCurrentFeature(feature);
            } catch (err) {
                console.error('Error emitting GeoJSON:', err);
            }
        }
        // Create and emit GeoJSON feature for polygon (when 3+ points exist)
        else if (activeMode === 'polygon' && points.length > 2) {
            const coords = points.map(p => [p.lng, p.lat]).filter((c): c is [number, number] => Array.isArray(c) && c.length === 2);
            if (coords.length > 2 && coords[0]) {
                coords.push([...coords[0]]); // Close the polygon

                const feature: GeoJSON.Feature = {
                    type: 'Feature',
                    properties: {},
                    geometry: {
                        type: 'Polygon',
                        coordinates: [coords],
                    },
                };

                try {
                    onSelectionChange?.(feature);
                    setCurrentFeature(feature);
                } catch (err) {
                    console.error('Error emitting GeoJSON:', err);
                }
            }
        }
        // Create and emit GeoJSON feature for circle (when 2 points exist)
        else if (activeMode === 'circle' && points.length > 1) {
            const center = points[0];
            const edge = points[points.length - 1];

            if (center && edge) {
                const radius = Math.sqrt(
                    Math.pow(edge.lng - center.lng, 2) + Math.pow(edge.lat - center.lat, 2)
                );

                // Create a circle as a polygon (36 points)
                const coords: [number, number][] = [];
                for (let i = 0; i < 36; i++) {
                    const angle = (i / 36) * 2 * Math.PI;
                    coords.push([
                        center.lng + radius * Math.cos(angle),
                        center.lat + radius * Math.sin(angle),
                    ]);
                }
                if (coords[0]) {
                    coords.push([...coords[0]]);
                }

                const feature: GeoJSON.Feature = {
                    type: 'Feature',
                    properties: {},
                    geometry: {
                        type: 'Polygon',
                        coordinates: [coords],
                    },
                };

                try {

                    setCurrentFeature(feature);
                } catch (err) {
                    console.error('Error emitting GeoJSON:', err);
                }
            }
        }
    }, [points, activeMode, redrawCanvas]);

    const handlePolygonMode = () => {
        setActiveMode(activeMode === 'polygon' ? null : 'polygon');
        setPoints([]);
    };

    const handleRectangleMode = () => {
        setActiveMode(activeMode === 'rectangle' ? null : 'rectangle');
        setPoints([]);
    };

    const handleCircleMode = () => {
        setActiveMode(activeMode === 'circle' ? null : 'circle');
        setPoints([]);
    };

    const handleClear = () => {
        setPoints([]);
        setActiveMode(null);
        setCurrentFeature(null);
        redrawCanvas();
    };

    const handleClose = () => {
        onClose?.();
        handleClear();
    };

    return (
        <>
            <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                onMouseMove={handleCanvasMouseMove}
                onMouseLeave={handleCanvasMouseLeave}
                className="absolute inset-0 z-20"
                style={{ cursor: activeMode ? 'crosshair' : 'default' }}
            />

            {/* Drawing Tools Panel - Right Side */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 z-30">
                <Card className=" ">
                    <div className="p-4">
                        <div className="flex items-center justify-between mb-4 gap-4">
                            <h3 className="text-slate-900 font-bold text-sm">Drawing Tools</h3>
                            <button
                                onClick={handleClose}
                                className="text-gray-500 hover:text-gray-700"
                                aria-label="Close drawing tools"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="flex flex-col items-center justify-center gap-2">
                            <Button
                                onClick={handlePolygonMode}
                                variant={activeMode === 'polygon' ? 'default' : 'outline'}
                                className="gap-2 w-full"
                                size="sm"
                            >
                                <Pen className="h-4 w-4" />

                            </Button>
                            <Button
                                onClick={handleRectangleMode}
                                variant={activeMode === 'rectangle' ? 'default' : 'outline'}
                                className="gap-2 w-full"
                                size="sm"
                            >
                                <Square className="h-4 w-4" />

                            </Button>
                            <Button
                                onClick={handleCircleMode}
                                variant={activeMode === 'circle' ? 'default' : 'outline'}
                                className="gap-2 w-full"
                                size="sm"
                            >
                                <Circle className="h-4 w-4" />

                            </Button>
                            {points.length > 0 && (
                                <Button
                                    onClick={handleClear}
                                    variant="destructive"
                                    className="gap-2 w-full"
                                    size="sm"
                                >
                                    Clear
                                </Button>
                            )}

                            {activeMode && points.length > 0 && (
                                <Button
                                    onClick={() => {
                                        setActiveMode(null);
                                        onSelectionChange?.(currentFeature);
                                        console.log('Final GeoJSON Feature:', currentFeature)
                                    }}
                                    variant="secondary"
                                    className="gap-2 w-full"
                                    size="sm"
                                >
                                    Save
                                </Button>
                            )}
                        </div>


                    </div>
                </Card>
            </div>
        </>
    );
}
