import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, ArrowRight } from "lucide-react";

const Login = () => {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if the backend sent us back with an error
    const errorParam = searchParams.get("error");
    if (errorParam) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("Authentication failed. Please try again.");
    }
  }, [searchParams]);

  const handleLogin = () => {
    // ⚠️ CRITICAL: We do NOT use axios here.
    // We must redirect the browser entirely to the Backend to start OAuth.
    window.location.href = "http://localhost:5000/api/auth/login";
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 bg-blue-100 p-3 rounded-full w-16 h-16 flex items-center justify-center">
            {/* Simple Logo Icon */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="w-8 h-8 text-blue-600"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            Form Builder
          </CardTitle>
          <CardDescription>
            Create dynamic forms powered by your Airtable data.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/* Error Message Alert */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {/* Login Button */}
          <Button
            className="w-full h-12 text-lg bg-blue-600 hover:bg-blue-700"
            onClick={handleLogin}
          >
            Login with Airtable <ArrowRight className="ml-2 h-5 w-5" />
          </Button>

          <p className="mt-4 text-xs text-center text-gray-400">
            You will be redirected to Airtable to authorize access.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
