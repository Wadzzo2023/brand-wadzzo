import { useRouter } from "next/router";
import { useEffect } from "react";

const HomePage = () => {
    const router = useRouter();
    useEffect(() => {
        // Redirect to the map page when the home page is accessed
        router.push("/map");
    }, []);

    return (
        <div className="flex items-center justify-center h-screen">
            <h1 className="text-2xl font-bold">Redirecting to Map...</h1>
        </div>
    );
};

export default HomePage;