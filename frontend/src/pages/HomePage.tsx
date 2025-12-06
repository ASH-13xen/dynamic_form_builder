/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import axios from "axios";

interface Form {
  _id: string;
  title: string;
  createdAt: string;
}

const HomePage = () => {
  const navigate = useNavigate();
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setError(null);
      try {
        const authRes = await axios.get("/api/auth/me");
        setUser(authRes.data);

        const formsRes = await axios.get("/api/forms");
        setForms(formsRes.data);
      } catch (err: any) {
        if (err.response?.status === 401) {
          navigate("/");
        } else if (err.response?.status === 404) {
          setError("Backend API not found.");
        } else {
          setError("Failed to load forms.");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await axios.post("/api/auth/logout");
      navigate("/");
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-8 font-sans text-black">
      <header className="max-w-4xl mx-auto flex justify-between items-center mb-12 border-b pb-4 border-black">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm mt-1">Logged in as {user?.email}</p>
        </div>
        <Button
          variant="outline"
          onClick={handleLogout}
          className="border-black text-black hover:bg-black hover:text-white rounded-none h-9 px-4"
        >
          Logout
        </Button>
      </header>

      <div className="max-w-4xl mx-auto">
        {error && (
          <div className="mb-6 p-3 border border-black text-sm">
            Error: {error}
          </div>
        )}

        <div className="mb-10">
          <Button
            onClick={() => navigate("/create")}
            className="w-full h-12 text-md bg-black text-white hover:bg-gray-800 rounded-none"
          >
            Create New Form
          </Button>
        </div>

        <section>
          <h2 className="text-xl font-bold mb-6 border-b border-black pb-2 inline-block">
            Your Forms ({forms.length})
          </h2>

          {forms.length === 0 && !error ? (
            <div className="text-center py-10 border border-black">
              <p className="text-sm">No forms created yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {forms.map((form) => (
                <div
                  key={form._id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-black"
                >
                  <div className="mb-4 sm:mb-0">
                    <h3 className="font-bold text-lg">{form.title}</h3>
                    <p className="text-xs mt-1">
                      Created: {new Date(form.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="border-black text-black hover:bg-gray-100 rounded-none h-8 text-xs"
                      onClick={() => navigate(`/form/${form._id}/responses`)}
                    >
                      Responses
                    </Button>
                    <Button
                      className="bg-black text-white hover:bg-gray-800 rounded-none h-8 text-xs"
                      onClick={() => navigate(`/form/${form._id}`)}
                    >
                      View Form
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default HomePage;
