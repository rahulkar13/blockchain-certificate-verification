import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { GraduationCap } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <div className="surface-card max-w-md rounded-lg p-8 text-center">
        <div className="brand-gradient mx-auto mb-5 w-fit rounded-lg p-3 shadow-[var(--glow-primary)]">
          <GraduationCap className="h-8 w-8 text-white" />
        </div>
        <h1 className="mb-3 text-4xl font-bold text-foreground">404</h1>
        <p className="mb-5 text-lg text-muted-foreground">Page not found</p>
        <a href="/" className="font-medium text-primary underline">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
