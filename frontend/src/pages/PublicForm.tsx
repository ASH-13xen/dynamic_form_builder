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

  const handleMultiSelectChange = (
    qKey: string,
    option: string,
    isChecked: boolean
  ) => {
    setAnswers((prev) => {
      const currentArray = prev[qKey] || [];
      if (isChecked) {
        return { ...prev, [qKey]: [...currentArray, option] };
      } else {
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

    const cleanAnswers: Record<string, any> = {};
    Object.keys(answers).forEach((key) => {
      const val = answers[key];
      if (val instanceof FileList) return;
      cleanAnswers[key] = val;
    });

    try {
      await axios.post(`/api/forms/${formId}/submit`, {
        answers: cleanAnswers,
      });

      alert("Application Submitted Successfully!");
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Failed to submit application. Check console.");
    }
  };

  if (loading)
    return (
      <div className="h-screen flex items-center justify-center bg-white text-black">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (error)
    return (
      <div className="p-10 text-center text-red-500 font-sans">{error}</div>
    );

  return (
    <div className="min-h-screen bg-white py-10 px-4 font-sans text-black">
      <Card className="max-w-2xl mx-auto border border-black shadow-none rounded-none">
        <CardHeader className="bg-black text-white rounded-none">
          <CardTitle className="text-2xl">{form.title}</CardTitle>
        </CardHeader>

        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-8">
            {form.questions.map((q: any) => {
              const isVisible = shouldShowQuestion(q.conditionalRules, answers);
              if (!isVisible) return null;

              return (
                <div
                  key={q.questionKey}
                  className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300"
                >
                  <label className="block text-sm font-bold text-black uppercase tracking-wide">
                    {q.label}{" "}
                    {q.required && <span className="text-red-500">*</span>}
                  </label>

                  {(q.type === "singleLineText" ||
                    q.type === "url" ||
                    q.type === "email") && (
                    <Input
                      required={q.required}
                      placeholder="Type here..."
                      className="border-black rounded-none focus-visible:ring-black"
                      onChange={(e) =>
                        handleChange(q.questionKey, e.target.value)
                      }
                    />
                  )}

                  {q.type === "multilineText" && (
                    <Textarea
                      required={q.required}
                      rows={4}
                      className="border-black rounded-none focus-visible:ring-black"
                      onChange={(e) =>
                        handleChange(q.questionKey, e.target.value)
                      }
                    />
                  )}

                  {q.type === "singleSelect" && (
                    <select
                      className="w-full p-2.5 border border-black rounded-none bg-white focus:ring-1 focus:ring-black outline-none"
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

                  {q.type === "multipleSelects" && (
                    <div className="space-y-2 border border-black p-3 rounded-none bg-white">
                      {q.options?.map((opt: string) => (
                        <label
                          key={opt}
                          className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-1"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 text-black rounded-none border-black focus:ring-black accent-black"
                            onChange={(e) =>
                              handleMultiSelectChange(
                                q.questionKey,
                                opt,
                                e.target.checked
                              )
                            }
                          />
                          <span className="text-sm text-black">{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {q.type === "multipleAttachments" && (
                    <Input
                      type="file"
                      multiple
                      required={q.required}
                      onChange={(e) =>
                        handleFileChange(q.questionKey, e.target.files)
                      }
                      className="cursor-pointer file:mr-4 file:py-2 file:px-4 file:border-0 file:text-sm file:font-semibold file:bg-black file:text-white hover:file:bg-gray-800 border-black rounded-none"
                    />
                  )}
                </div>
              );
            })}

            <div className="pt-6 border-t border-black">
              <Button
                type="submit"
                className="w-full bg-black text-white hover:bg-gray-800 text-lg h-12 shadow-none rounded-none uppercase font-bold tracking-wider"
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
