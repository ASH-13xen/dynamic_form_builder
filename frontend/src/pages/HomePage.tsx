/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Plus,
  FileText,
  LogOut,
  ExternalLink,
  Loader2,
  LayoutDashboard,
  AlertCircle,
  BarChart,
} from "lucide-react";
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
          setError("API Endpoint not found. Check backend routes.");
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
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 md:p-10">
      {/* HEADER */}
      <header className="max-w-6xl mx-auto flex justify-between items-center mb-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg shadow-sm">
            <LayoutDashboard className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500">
              Welcome back,{" "}
              <span className="font-medium text-gray-900">{user?.email}</span>
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={handleLogout}
          className="text-red-600 hover:bg-red-50 border-red-200"
        >
          <LogOut size={16} className="mr-2" /> Logout
        </Button>
      </header>

      <div className="max-w-6xl mx-auto space-y-8">
        {/* ERROR MESSAGE */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        {/* TOP ROW */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card
            className="col-span-1 border-2 border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-500 transition-all cursor-pointer group shadow-sm flex flex-col justify-center items-center"
            onClick={() => navigate("/create")}
          >
            <CardContent className="flex flex-col items-center justify-center py-10">
              <div className="bg-white p-4 rounded-full shadow-sm mb-4 group-hover:scale-110 transition-transform">
                <Plus className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-blue-900">
                Create New Form
              </h3>
            </CardContent>
          </Card>

          <Card className="col-span-1 md:col-span-2 shadow-sm border-gray-200">
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-6 bg-gray-100 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-500 mb-1 font-medium uppercase tracking-wide">
                  Total Forms Created
                </p>
                <p className="text-4xl font-extrabold text-gray-900">
                  {forms.length}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* FORMS LIST */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="text-gray-400" size={20} />
            <h2 className="text-xl font-semibold text-gray-800">Your Forms</h2>
          </div>

          {forms.length === 0 && !error ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="inline-block p-4 bg-gray-50 rounded-full mb-4">
                <FileText className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900">
                No forms yet
              </h3>
              <p className="text-gray-500 mb-6">
                Create your first form to start collecting data.
              </p>
              <Button onClick={() => navigate("/create")}>Create Form</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {forms.map((form) => (
                <Card
                  key={form._id}
                  className="flex flex-col hover:shadow-lg transition-shadow border-gray-200 overflow-hidden"
                >
                  <CardHeader className="pb-2">
                    <CardTitle
                      className="text-lg font-bold text-gray-800 truncate"
                      title={form.title}
                    >
                      {form.title}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Created on {new Date(form.createdAt).toLocaleDateString()}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="mt-auto pt-0">
                    <div className="h-px bg-gray-100 my-4" />

                    {/* BUTTONS STACKED VERTICALLY */}
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        className="w-full text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/form/${form._id}/responses`);
                        }}
                      >
                        <BarChart className="h-3 w-3 mr-1" /> Responses
                      </Button>

                      <Button
                        className="w-full text-xs bg-gray-900 hover:bg-gray-800"
                        onClick={() => navigate(`/form/${form._id}`)}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" /> View Public
                        Form
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default HomePage;
