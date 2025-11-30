/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function ResponseList() {
  const { formId } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState<any>(null);
  const [responses, setResponses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const formRes = await axios.get(`/api/forms/${formId}`);
        setForm(formRes.data);

        const responseRes = await axios.get(`/api/forms/${formId}/responses`);
        setResponses(responseRes.data);
      } catch (error) {
        console.error("Failed to load data", error);
        alert("Failed to load responses. Are you logged in?");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [formId]);

  if (loading)
    return (
      <div className="h-screen flex items-center justify-center bg-white text-black font-sans">
        <Loader2 className="animate-spin" />
      </div>
    );

  return (
    <div className="min-h-screen bg-white p-8 font-sans text-black">
      <div className="max-w-6xl mx-auto mb-8 flex justify-between items-center border-b border-black pb-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => navigate("/dashboard")}
            className="hover:bg-gray-100 rounded-none text-black px-0"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <h1 className="text-2xl font-bold">
            Responses: <span className="font-normal">{form?.title}</span>
          </h1>
        </div>
        <div className="border border-black px-4 py-2 text-sm font-medium">
          Total: {responses.length}
        </div>
      </div>

      <Card className="max-w-6xl mx-auto border border-black shadow-none rounded-none">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-black text-white uppercase font-bold text-xs">
                <tr>
                  <th className="px-6 py-4 whitespace-nowrap border-b border-white/20">
                    #
                  </th>
                  <th className="px-6 py-4 whitespace-nowrap border-b border-white/20">
                    Submitted At
                  </th>

                  {form?.questions.map((q: any) => (
                    <th
                      key={q.questionKey}
                      className="px-6 py-4 min-w-[150px] border-b border-white/20"
                    >
                      {q.label}
                    </th>
                  ))}

                  <th className="px-6 py-4 whitespace-nowrap border-b border-white/20">
                    Airtable ID
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 bg-white">
                {responses.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-6 py-12 text-center text-gray-500 font-medium"
                    >
                      No responses yet.
                    </td>
                  </tr>
                ) : (
                  responses.map((resp, idx) => (
                    <tr
                      key={resp._id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4 font-bold border-r border-gray-100">
                        {idx + 1}
                      </td>
                      <td className="px-6 py-4 border-r border-gray-100 font-mono text-xs text-gray-600">
                        {new Date(resp.submittedAt).toLocaleString()}
                      </td>

                      {form?.questions.map((q: any) => {
                        const answer = resp.answers[q.questionKey];
                        const displayValue = Array.isArray(answer)
                          ? answer.join(", ")
                          : String(answer || "-");

                        return (
                          <td
                            key={q.questionKey}
                            className="px-6 py-4 text-black border-r border-gray-100 truncate max-w-[200px]"
                            title={displayValue}
                          >
                            {displayValue}
                          </td>
                        );
                      })}

                      <td className="px-6 py-4 text-gray-400 font-mono text-xs">
                        {resp.airtableRecordId}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
