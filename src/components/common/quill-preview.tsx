import dynamic from "next/dynamic";

import "react-quill-new/dist/quill.bubble.css";

// Created once, outside render (see quill-editor.tsx).
const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false });

interface PreviewProps {
    value: string;
}

export const Preview = ({ value }: PreviewProps) => {
    return <ReactQuill className="m-0 p-0" theme="bubble" value={value} readOnly />;
};
