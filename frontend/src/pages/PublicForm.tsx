/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { shouldShowQuestion } from "@/lib/logic";

export default function PublicForm() {
  const { formId } = useParams();

  const [form, setForm] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<Record<string, any>>({});

  useEffect(() => {
    axios
      .get(`/api/forms/${formId}`)
      .then((res) => setForm(res.data))
      .catch(() => setError("Form not found or access denied."))
      .finally(() => setLoading(false));
  }, [formId]);

  const handleChange = (qKey: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [qKey]: value }));
  };

  // --- SPECIAL HANDLER FOR MULTI-SELECT (CHECKBOXES) ---
  const handleMultiSelectChange = (
    qKey: string,
    option: string,
    isChecked: boolean
  ) => {
    setAnswers((prev) => {
      const currentArray = prev[qKey] || [];
      if (isChecked) {
        // Add option if not exists
        return { ...prev, [qKey]: [...currentArray, option] };
      } else {
        // Remove option
        return {
          ...prev,
          [qKey]: currentArray.filter((item: string) => item !== option),
        };
      }
    });
  };

  const handleFileChange = (qKey: string, files: FileList | null) => {
    if (files && files.length > 0) {
      setAnswers((prev) => ({ ...prev, [qKey]: files }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Remove File objects for now (Airtable API limitation without S3)
    // We filter the answers to only send text/numbers/arrays
    const cleanAnswers: Record<string, any> = {};
    Object.keys(answers).forEach((key) => {
      const val = answers[key];
      // Skip file lists for API submission
      if (val instanceof FileList) return;
      cleanAnswers[key] = val;
    });

    try {
      await axios.post(`/api/forms/${formId}/submit`, {
        answers: cleanAnswers,
      });

      alert("Application Submitted Successfully!");
      // Optional: Refresh page or redirect
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Failed to submit application. Check console.");
    }
  };

  if (loading)
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (error)
    return <div className="p-10 text-center text-red-500">{error}</div>;

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4">
      <Card className="max-w-2xl mx-auto shadow-lg">
        <CardHeader className="bg-blue-600 text-white rounded-t-lg">
          <CardTitle className="text-2xl">{form.title}</CardTitle>
        </CardHeader>

        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-8">
            {form.questions.map((q: any) => {
              // 1. Run Logic
              const isVisible = shouldShowQuestion(q.conditionalRules, answers);
              if (!isVisible) return null;

              return (
                <div
                  key={q.questionKey}
                  className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300"
                >
                  <label className="block text-sm font-bold text-gray-800">
                    {q.label}{" "}
                    {q.required && <span className="text-red-500">*</span>}
                  </label>

                  {/* --- RENDER BASED ON TYPE --- */}

                  {/* TYPE: TEXT / URL / EMAIL */}
                  {(q.type === "singleLineText" ||
                    q.type === "url" ||
                    q.type === "email") && (
                    <Input
                      required={q.required}
                      placeholder="Type your answer..."
                      onChange={(e) =>
                        handleChange(q.questionKey, e.target.value)
                      }
                    />
                  )}

                  {/* TYPE: LONG TEXT */}
                  {q.type === "multilineText" && (
                    <Textarea
                      required={q.required}
                      rows={4}
                      onChange={(e) =>
                        handleChange(q.questionKey, e.target.value)
                      }
                    />
                  )}

                  {/* TYPE: SINGLE SELECT (Dropdown) */}
                  {q.type === "singleSelect" && (
                    <select
                      className="w-full p-2.5 border rounded-md bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                      required={q.required}
                      onChange={(e) =>
                        handleChange(q.questionKey, e.target.value)
                      }
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Select an option
                      </option>
                      {q.options?.map((opt: string) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* TYPE: MULTI SELECT (Checkboxes) - NEW! */}
                  {q.type === "multipleSelects" && (
                    <div className="space-y-2 border p-3 rounded-md bg-gray-50/50">
                      {q.options?.map((opt: string) => (
                        <label
                          key={opt}
                          className="flex items-center space-x-3 cursor-pointer hover:bg-gray-100 p-1 rounded"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            onChange={(e) =>
                              handleMultiSelectChange(
                                q.questionKey,
                                opt,
                                e.target.checked
                              )
                            }
                          />
                          <span className="text-sm text-gray-700">{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* TYPE: FILE UPLOAD */}
                  {q.type === "multipleAttachments" && (
                    <Input
                      type="file"
                      multiple
                      required={q.required}
                      onChange={(e) =>
                        handleFileChange(q.questionKey, e.target.files)
                      }
                      className="cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                  )}
                </div>
              );
            })}

            <div className="pt-6 border-t">
              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-lg h-12 shadow-md"
              >
                Submit Application
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
