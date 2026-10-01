import clsx from "clsx";
import dynamic from "next/dynamic";
import "react-quill-new/dist/quill.snow.css";

interface EditorProps {
    onChange: (value: string) => void;
    value: string;
    className?: string;
    placeholder?: string;
}

const modules = {
    toolbar: [
        [{ header: [1, 2, 3, 4, 5, 6, false] }],
        ["bold", "italic", "underline", "strike", "blockquote"],
        [{ list: "ordered" }, { list: "bullet" }, { 'list': 'check' }, { indent: "-1" }, { indent: "+1" }],
        ["link",],
        ["clean"],
        ["code-block"],
        [{ 'color': [] }, { 'background': [] }],          // dropdown with defaults from theme
        [{ 'direction': 'rtl' }],                         // text direction

    ],

}

// Created once: making it inside render gives a new component every render,
// which remounts Quill, fires onChange, re-renders the form — an endless loop.
const ReactQuill = dynamic(() => import("react-quill-new"), {
    ssr: false,
    loading: () => <div className="h-[150px] rounded-lg border bg-card skeleton" />,
});

export const Editor = ({
    onChange,
    value,
    className,
    placeholder,
}: EditorProps) => {
    return (
        <div className="quill-editor-wrapper">
            <ReactQuill
                className={
                    clsx(
                        "quill-editor",
                        className,
                    )
                }

                value={value}
                modules={modules}
                placeholder={placeholder}
                onChange={onChange}
            />

        </div>
    );
};
