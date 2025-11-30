/* eslint-disable react-hooks/set-state-in-effect */
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

const Login = () => {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setError("Authentication failed. Please try again.");
    }
  }, [searchParams]);

  const handleLogin = () => {
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
    window.location.href = `${API_URL}/api/auth/login`;
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4 font-sans text-black">
      <Card className="w-full max-w-sm border border-black shadow-none rounded-none">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-2xl font-bold tracking-tight">
            Form Builder
          </CardTitle>
          <CardDescription className="text-gray-500 text-sm mt-1">
            Connect your Airtable account to start.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4">
          {error && (
            <div className="mb-4 p-3 border border-red-500 bg-red-50 text-red-700 text-sm text-center">
              {error}
            </div>
          )}

          <Button
            className="w-full h-10 text-sm font-medium bg-black text-white hover:bg-gray-800 rounded-none transition-colors"
            onClick={handleLogin}
          >
            Login with Airtable
          </Button>

          <p className="mt-4 text-xs text-center text-gray-400">
            You will be redirected to authorize access.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
