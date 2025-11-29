/* eslint-disable @typescript-eslint/no-unused-vars */
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

// --- TYPES ---
interface FormQuestion {
  questionKey: string;
  airtableFieldId: string;
  label: string;
  type: string;
  options?: string[];
  required: boolean;
  conditionalRules: {
    logic: "AND" | "OR";
    conditions: {
      questionKey: string;
      operator: "equals" | "notEquals" | "contains";
      value: string;
    }[];
  } | null;
}

const CreateForm = () => {
  const navigate = useNavigate();

  // STEP 1 STATE
  const [step, setStep] = useState(1);
  const [bases, setBases] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [selectedBaseId, setSelectedBaseId] = useState("");
  const [selectedTableId, setSelectedTableId] = useState("");
  const [availableFields, setAvailableFields] = useState<any[]>([]);

  // STEP 2 STATE
  const [formTitle, setFormTitle] = useState("Untitled Form");
  const [questions, setQuestions] = useState<FormQuestion[]>([]);

  // LOGIC MODAL STATE
  const [logicModalOpen, setLogicModalOpen] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<
    number | null
  >(null);
  const [tempConditions, setTempConditions] = useState<any[]>([]);
  const [tempLogicGate, setTempLogicGate] = useState<"AND" | "OR">("AND");

  // --- INITIAL DATA FETCH ---
  useEffect(() => {
    axios
      .get("/api/forms/bases")
      .then((res) => setBases(res.data))
      .catch(console.error);
  }, []);

  const handleBaseChange = async (baseId: string) => {
    setSelectedBaseId(baseId);
    setTables([]);
    if (!baseId) return;
    const res = await axios.get(`/api/forms/tables/${baseId}`);
    setTables(res.data);
  };

  const handleNext = () => {
    const table = tables.find((t) => t.id === selectedTableId);
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
    const filtered = table.fields.filter((f: any) => allowed.includes(f.type));
    setAvailableFields(filtered);
    setStep(2);
  };

  const addField = (field: any) => {
    let mappedType = field.type;
    if (["url", "email", "phoneNumber", "singleLineText"].includes(field.type))
      mappedType = "singleLineText";
    else if (field.type === "multilineText") mappedType = "multilineText";
    else if (field.type === "multipleAttachments")
      mappedType = "multipleAttachments";
    else if (field.type === "singleSelect") mappedType = "singleSelect";
    else if (field.type === "multipleSelects") mappedType = "multipleSelects";
    else mappedType = "singleLineText";

    let extractedOptions: string[] = [];
    if (field.options?.choices)
      extractedOptions = field.options.choices.map((c: any) => c.name);

    setQuestions([
      ...questions,
      {
        questionKey: crypto.randomUUID(),
        airtableFieldId: field.id,
        label: field.name,
        type: mappedType,
        required: false,
        options: extractedOptions,
        conditionalRules: null,
      },
    ]);
  };

  const updateQuestion = (index: number, updates: Partial<FormQuestion>) => {
    const newQs = [...questions];
    newQs[index] = { ...newQs[index], ...updates };
    setQuestions(newQs);
  };

  // --- LOGIC MODAL HANDLERS ---
  const openLogicModal = (index: number) => {
    setCurrentQuestionIndex(index);
    const q = questions[index];
    if (q.conditionalRules) {
      setTempConditions(q.conditionalRules.conditions);
      setTempLogicGate(q.conditionalRules.logic);
    } else {
      setTempConditions([]);
      setTempLogicGate("AND");
    }
    setLogicModalOpen(true);
  };

  const saveLogic = () => {
    if (currentQuestionIndex === null) return;

    let newRules = null;
    if (tempConditions.length > 0) {
      newRules = {
        logic: tempLogicGate,
        conditions: tempConditions,
      };
    }

    updateQuestion(currentQuestionIndex, { conditionalRules: newRules });
    setLogicModalOpen(false);
  };

  const addCondition = () => {
    // Default condition
    setTempConditions([
      ...tempConditions,
      { questionKey: "", operator: "equals", value: "" },
    ]);
  };

  const updateCondition = (idx: number, field: string, value: any) => {
    const newConds = [...tempConditions];
    newConds[idx] = { ...newConds[idx], [field]: value };
    setTempConditions(newConds);
  };

  const removeCondition = (idx: number) => {
    setTempConditions(tempConditions.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!formTitle || questions.length === 0) return alert("Add fields first.");
    try {
      await axios.post("/api/forms", {
        baseId: selectedBaseId,
        tableId: selectedTableId,
        title: formTitle,
        questions: questions,
      });
      alert("Form Saved Successfully!");
      navigate("/dashboard");
    } catch (error) {
      alert("Failed to save form.");
    }
  };

  // --- RENDER STEP 1 ---
  if (step === 1) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle>Step 1: Connect Data Source</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <select
              className="w-full p-2 border rounded"
              onChange={(e) => handleBaseChange(e.target.value)}
            >
              <option value="">-- Choose Base --</option>
              {bases.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select
              className="w-full p-2 border rounded"
              disabled={!selectedBaseId}
              onChange={(e) => setSelectedTableId(e.target.value)}
            >
              <option value="">-- Choose Table --</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <div className="flex justify-end pt-4">
              <Button onClick={handleNext} disabled={!selectedTableId}>
                Next Step <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- RENDER STEP 2 ---
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col relative">
      <header className="bg-white border-b p-4 flex justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Input
            className="text-lg font-bold w-64"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
          />
        </div>
        <Button
          onClick={handleSave}
          className="bg-green-600 hover:bg-green-700"
        >
          <Save className="mr-2 h-4 w-4" /> Save Form
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 bg-white border-r p-4 overflow-y-auto">
          <h3 className="font-semibold text-gray-500 mb-4 text-xs uppercase">
            Available Fields
          </h3>
          <div className="space-y-2">
            {availableFields.map((field) => {
              const isAdded = questions.some(
                (q) => q.airtableFieldId === field.id
              );
              return (
                <div
                  key={field.id}
                  className="flex justify-between p-3 bg-gray-50 border rounded hover:border-blue-300"
                >
                  <span className="text-sm truncate w-40">{field.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isAdded}
                    onClick={() => addField(field)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </aside>

        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-2xl mx-auto space-y-4">
            {questions.map((q, idx) => (
              <Card
                key={q.questionKey}
                className="border-l-4 border-l-blue-500 shadow-sm"
              >
                <CardContent className="p-4 space-y-4">
                  <div className="flex justify-between items-center">
                    <Input
                      value={q.label}
                      onChange={(e) =>
                        updateQuestion(idx, { label: e.target.value })
                      }
                      className="font-medium"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-400"
                      onClick={() =>
                        setQuestions(questions.filter((_, i) => i !== idx))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between border-t pt-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={q.required}
                        onCheckedChange={(c) =>
                          updateQuestion(idx, { required: c })
                        }
                      />
                      <span className="text-sm text-gray-600">Required</span>
                    </div>

                    <Button
                      variant={q.conditionalRules ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => openLogicModal(idx)}
                      className="text-xs"
                    >
                      <GitMerge className="h-3 w-3 mr-1" />
                      {q.conditionalRules ? "Logic Active" : "Add Logic"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </main>
      </div>

      {/* --- LOGIC EDITOR MODAL --- */}
      {logicModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-[600px] shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>Conditional Logic</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLogicModalOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto">
              <p className="text-sm text-gray-500">
                Show "
                <strong>
                  {currentQuestionIndex !== null &&
                    questions[currentQuestionIndex].label}
                </strong>
                " only if:
              </p>

              {tempConditions.map((cond, cIdx) => (
                <div
                  key={cIdx}
                  className="flex gap-2 items-center bg-gray-50 p-2 rounded"
                >
                  {/* 1. SELECT TRIGGER QUESTION */}
                  <select
                    className="flex-1 p-2 border rounded text-sm"
                    value={cond.questionKey}
                    onChange={(e) =>
                      updateCondition(cIdx, "questionKey", e.target.value)
                    }
                  >
                    <option value="">Select Field...</option>
                    {/* Only show questions that come BEFORE this one to prevent loops */}
                    {questions.map((q) => (
                      <option key={q.questionKey} value={q.questionKey}>
                        {q.label}
                      </option>
                    ))}
                  </select>

                  {/* 2. OPERATOR */}
                  <select
                    className="w-24 p-2 border rounded text-sm"
                    value={cond.operator}
                    onChange={(e) =>
                      updateCondition(cIdx, "operator", e.target.value)
                    }
                  >
                    <option value="equals">Equals</option>
                    <option value="notEquals">Not Equal</option>
                    <option value="contains">Contains</option>
                  </select>

                  {/* 3. VALUE INPUT (Smart Switch) */}
                  {(() => {
                    const triggerQ = questions.find(
                      (q) => q.questionKey === cond.questionKey
                    );
                    if (triggerQ?.options && triggerQ.options.length > 0) {
                      return (
                        <select
                          className="flex-1 p-2 border rounded text-sm"
                          value={cond.value}
                          onChange={(e) =>
                            updateCondition(cIdx, "value", e.target.value)
                          }
                        >
                          <option value="">Select Value...</option>
                          {triggerQ.options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      );
                    }
                    return (
                      <Input
                        className="flex-1 h-9 text-sm"
                        placeholder="Value..."
                        value={cond.value}
                        onChange={(e) =>
                          updateCondition(cIdx, "value", e.target.value)
                        }
                      />
                    );
                  })()}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-400"
                    onClick={() => removeCondition(cIdx)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                className="w-full border-dashed"
                onClick={addCondition}
              >
                <Plus className="h-3 w-3 mr-2" /> Add Condition
              </Button>

              {tempConditions.length > 1 && (
                <div className="flex items-center gap-2 pt-2 border-t">
                  <span className="text-sm">Logic Operator:</span>
                  <div className="flex gap-1 bg-gray-100 p-1 rounded">
                    {["AND", "OR"].map((op) => (
                      <button
                        key={op}
                        onClick={() => setTempLogicGate(op as "AND" | "OR")}
                        className={`px-3 py-1 text-xs rounded ${
                          tempLogicGate === op
                            ? "bg-white shadow text-blue-600 font-bold"
                            : "text-gray-500"
                        }`}
                      >
                        {op}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
            <div className="p-4 border-t flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setLogicModalOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={saveLogic}>Save Logic</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CreateForm;
