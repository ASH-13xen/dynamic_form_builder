/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  Plus,
  Save,
  Trash2,
  ArrowRight,
  GitMerge,
  X,
} from "lucide-react";
import axios from "axios";

const CreateForm = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [data, setData] = useState({ bases: [], tables: [], fields: [] });
  const [selection, setSelection] = useState({ baseId: "", tableId: "" });
  const [form, setForm] = useState({
    title: "Untitled Form",
    questions: [] as any[],
  });
  const [logic, setLogic] = useState({
    isOpen: false,
    qIndex: null as number | null,
    conditions: [] as any[],
    gate: "AND" as "AND" | "OR",
  });

  useEffect(() => {
    axios
      .get("/api/forms/bases")
      .then((res) => setData((prev) => ({ ...prev, bases: res.data })))
      .catch(console.error);
  }, []);

  const handleBaseChange = async (baseId: string) => {
    setSelection({ baseId, tableId: "" });
    if (!baseId) return;
    const res2 = await axios.post(`/api/webhooks/register/${baseId}`);
    const res = await axios.get(`/api/forms/tables/${baseId}`);
    setData((prev) => ({ ...prev, tables: res.data }));
  };

  const handleNext = () => {
    const table: any = data.tables.find((t: any) => t.id === selection.tableId);
    if (!table) return;
    const allowed = [
      "singleLineText",
      "multilineText",
      "singleSelect",
      "multipleSelects",
      "multipleAttachments",
      "url",
      "email",
      "phoneNumber",
    ];
    setData((prev) => ({
      ...prev,
      fields: table.fields.filter((f: any) => allowed.includes(f.type)),
    }));
    setStep(2);
  };

  const addField = (field: any) => {
    const typeMap: any = {
      url: "singleLineText",
      email: "singleLineText",
      phoneNumber: "singleLineText",
    };
    const type =
      typeMap[field.type] ||
      ([
        "multilineText",
        "multipleAttachments",
        "singleSelect",
        "multipleSelects",
      ].includes(field.type)
        ? field.type
        : "singleLineText");

    setForm((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        {
          questionKey: crypto.randomUUID(),
          airtableFieldId: field.id,
          label: field.name,
          type,
          required: false,
          options: field.options?.choices?.map((c: any) => c.name) || [],
          conditionalRules: null,
        },
      ],
    }));
  };

  const updateQ = (idx: number, updates: any) => {
    const qs = [...form.questions];
    qs[idx] = { ...qs[idx], ...updates };
    setForm((prev) => ({ ...prev, questions: qs }));
  };

  const openLogic = (idx: number) => {
    const q = form.questions[idx];
    setLogic({
      isOpen: true,
      qIndex: idx,
      conditions: q.conditionalRules?.conditions || [],
      gate: q.conditionalRules?.logic || "AND",
    });
  };

  const saveLogic = () => {
    if (logic.qIndex === null) return;
    updateQ(logic.qIndex, {
      conditionalRules:
        logic.conditions.length > 0
          ? { logic: logic.gate, conditions: logic.conditions }
          : null,
    });
    setLogic((prev) => ({ ...prev, isOpen: false }));
  };

  const handleSave = async () => {
    if (!form.title || form.questions.length === 0)
      return alert("Add fields first.");
    try {
      await axios.post("/api/forms", {
        baseId: selection.baseId,
        tableId: selection.tableId,
        title: form.title,
        questions: form.questions,
      });
      alert("Saved!");
      navigate("/dashboard");
    } catch {
      alert("Failed to save.");
    }
  };

  if (step === 1)
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4 font-sans text-black">
        <Card className="w-full max-w-2xl border border-black shadow-none rounded-none">
          <CardHeader>
            <CardTitle>Step 1: Connect Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <select
              className="w-full p-2 border border-black rounded-none"
              onChange={(e) => handleBaseChange(e.target.value)}
            >
              <option value="">-- Choose Base --</option>
              {data.bases.map((b: any) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select
              className="w-full p-2 border border-black rounded-none"
              disabled={!selection.baseId}
              onChange={(e) =>
                setSelection((prev) => ({ ...prev, tableId: e.target.value }))
              }
            >
              <option value="">-- Choose Table --</option>
              {data.tables.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <div className="flex justify-end pt-4">
              <Button
                onClick={handleNext}
                disabled={!selection.tableId}
                className="bg-black text-white hover:bg-gray-800 rounded-none"
              >
                Next Step <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans text-black">
      <header className="bg-white border-b border-black p-4 flex justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep(1)}
            className="rounded-none"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Input
            className="text-lg font-bold w-64 border-none shadow-none rounded-none"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          />
        </div>
        <Button
          onClick={handleSave}
          className="bg-black text-white hover:bg-gray-800 rounded-none"
        >
          <Save className="mr-2 h-4 w-4" /> Save Form
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 border-r border-black p-4 overflow-y-auto">
          <h3 className="font-bold mb-4 text-xs uppercase">Fields</h3>
          <div className="space-y-2">
            {data.fields.map((f: any) => (
              <div
                key={f.id}
                className="flex justify-between p-3 border border-black rounded-none hover:bg-gray-50"
              >
                <span className="text-sm truncate w-40">{f.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={form.questions.some(
                    (q) => q.airtableFieldId === f.id
                  )}
                  onClick={() => addField(f)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </aside>

        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-2xl mx-auto space-y-4">
            {form.questions.map((q, idx) => (
              <Card
                key={q.questionKey}
                className="border border-black shadow-none rounded-none"
              >
                <CardContent className="p-4 space-y-4">
                  <div className="flex justify-between items-center">
                    <Input
                      value={q.label}
                      onChange={(e) => updateQ(idx, { label: e.target.value })}
                      className="font-medium border-black rounded-none"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setForm((p) => ({
                          ...p,
                          questions: p.questions.filter((_, i) => i !== idx),
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={q.required}
                        onCheckedChange={(c) => updateQ(idx, { required: c })}
                      />
                      <span className="text-sm">Required</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openLogic(idx)}
                      className={`text-xs border rounded-none ${
                        q.conditionalRules
                          ? "bg-black text-white"
                          : "border-black"
                      }`}
                    >
                      <GitMerge className="h-3 w-3 mr-1" />{" "}
                      {q.conditionalRules ? "Logic Active" : "Add Logic"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>

      {logic.isOpen && (
        <div className="fixed inset-0 bg-white/90 flex items-center justify-center z-50">
          <Card className="w-[600px] border border-black shadow-none rounded-none bg-white">
            <CardHeader className="flex flex-row justify-between pb-2 border-b border-black">
              <CardTitle>Conditional Logic</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLogic((p) => ({ ...p, isOpen: false }))}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto pt-4">
              <p className="text-sm">
                Show "<strong>{form.questions[logic.qIndex!]?.label}</strong>"
                only if:
              </p>
              {logic.conditions.map((cond, cIdx) => (
                <div
                  key={cIdx}
                  className="flex gap-2 items-center border border-gray-200 p-2"
                >
                  <select
                    className="flex-1 p-2 border border-black text-sm"
                    value={cond.questionKey}
                    onChange={(e) => {
                      const newC = [...logic.conditions];
                      newC[cIdx].questionKey = e.target.value;
                      setLogic((p) => ({ ...p, conditions: newC }));
                    }}
                  >
                    <option value="">Select Field...</option>
                    {form.questions.map((q) => (
                      <option key={q.questionKey} value={q.questionKey}>
                        {q.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="w-24 p-2 border border-black text-sm"
                    value={cond.operator}
                    onChange={(e) => {
                      const newC = [...logic.conditions];
                      newC[cIdx].operator = e.target.value;
                      setLogic((p) => ({ ...p, conditions: newC }));
                    }}
                  >
                    <option value="equals">Equals</option>
                    <option value="notEquals">Not Equal</option>
                    <option value="contains">Contains</option>
                  </select>
                  {(() => {
                    const triggerQ = form.questions.find(
                      (q) => q.questionKey === cond.questionKey
                    );
                    if (triggerQ?.options && triggerQ.options.length > 0) {
                      return (
                        <select
                          className="flex-1 p-2 border border-black text-sm"
                          value={cond.value}
                          onChange={(e) => {
                            const newC = [...logic.conditions];
                            newC[cIdx].value = e.target.value;
                            setLogic((p) => ({ ...p, conditions: newC }));
                          }}
                        >
                          <option value="">Select Value...</option>
                          {triggerQ.options.map((opt: any) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      );
                    }
                    return (
                      <Input
                        className="flex-1 h-9 text-sm border-black rounded-none"
                        placeholder="Value..."
                        value={cond.value}
                        onChange={(e) => {
                          const newC = [...logic.conditions];
                          newC[cIdx].value = e.target.value;
                          setLogic((p) => ({ ...p, conditions: newC }));
                        }}
                      />
                    );
                  })()}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setLogic((p) => ({
                        ...p,
                        conditions: p.conditions.filter((_, i) => i !== cIdx),
                      }))
                    }
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full border-dashed border-black rounded-none"
                onClick={() =>
                  setLogic((p) => ({
                    ...p,
                    conditions: [
                      ...p.conditions,
                      { questionKey: "", operator: "equals", value: "" },
                    ],
                  }))
                }
              >
                <Plus className="h-3 w-3 mr-2" /> Add Condition
              </Button>
              {logic.conditions.length > 1 && (
                <div className="flex gap-1 border border-black p-1 w-fit">
                  {["AND", "OR"].map((op) => (
                    <button
                      key={op}
                      onClick={() =>
                        setLogic((p) => ({ ...p, gate: op as any }))
                      }
                      className={`px-3 py-1 text-xs ${
                        logic.gate === op
                          ? "bg-black text-white"
                          : "text-gray-500"
                      }`}
                    >
                      {op}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
            <div className="p-4 border-t border-black flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setLogic((p) => ({ ...p, isOpen: false }))}
                className="border-black rounded-none"
              >
                Cancel
              </Button>
              <Button
                onClick={saveLogic}
                className="bg-black text-white rounded-none"
              >
                Save Logic
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CreateForm;
