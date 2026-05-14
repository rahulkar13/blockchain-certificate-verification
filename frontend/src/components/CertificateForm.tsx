import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarIcon,
  Eye,
  FileText,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { normalizeCertificateTemplate } from "@/utils/adminSettings";
import { isDateAfter, isDateOnOrBefore, parseDateOnly, toDateOnlyString } from "@/utils/dateOnly";

type CertificateDraft = {
  studentName?: string;
  studentEmail?: string;
  courseName?: string;
  issueDate?: string | Date;
  expiryDate?: string | Date;
  additionalInfo?: string;
  template?: string;
};

type CertificateFormProps = {
  onSubmit: (data: Record<string, unknown>) => void;
  onPreview?: (data: Record<string, unknown>) => void;
  isLoading: boolean;
  draftData?: CertificateDraft | null;
  defaultTemplate?: string;
};

export default function CertificateForm({
  onSubmit,
  onPreview,
  isLoading,
  draftData,
  defaultTemplate = "completion",
}: CertificateFormProps) {
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [courseName, setCourseName] = useState("");
  const [issueDate, setIssueDate] = useState<Date | null>(null);
  const [expiryDate, setExpiryDate] = useState<Date | null>(null);
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [template, setTemplate] = useState(normalizeCertificateTemplate(defaultTemplate));
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isExpiryCalendarOpen, setIsExpiryCalendarOpen] = useState(false);

  useEffect(() => {
    if (!draftData) return;

    setStudentName(draftData.studentName || "");
    setStudentEmail(draftData.studentEmail || "");
    setCourseName(draftData.courseName || "");
    setIssueDate(parseDateOnly(draftData.issueDate));
    setExpiryDate(parseDateOnly(draftData.expiryDate));
    setAdditionalInfo(draftData.additionalInfo || "");
    setTemplate(normalizeCertificateTemplate(draftData.template || defaultTemplate));
  }, [draftData, defaultTemplate]);

  useEffect(() => {
    if (!draftData) {
      setTemplate(normalizeCertificateTemplate(defaultTemplate));
    }
  }, [defaultTemplate, draftData]);

  const handleEmailChange = (value: string) => {
    setStudentEmail(value);
  };

  useEffect(() => {
    if (issueDate && expiryDate && !isDateAfter(expiryDate, issueDate)) {
      setExpiryDate(null);
    }
  }, [issueDate, expiryDate]);

  const collectData = () => ({
    studentName,
    studentEmail,
    courseName,
    issueDate: toDateOnlyString(issueDate),
    expiryDate: toDateOnlyString(expiryDate),
    additionalInfo,
    template,
  });

  const previewCertificate = () => {
    if (!studentName || !courseName || !issueDate) {
      toast({
        title: "Preview details missing",
        description: "Enter student name, course, and issue date before preview.",
        variant: "destructive",
      });
      return;
    }

    if (expiryDate && !isDateAfter(expiryDate, issueDate)) {
      toast({
        title: "Invalid expiry date",
        description: "Expiry date must be after the issue date.",
        variant: "destructive",
      });
      return;
    }

    onPreview?.(collectData());
  };

  const submitForm = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!studentName || !studentEmail || !courseName || !issueDate) {
      toast({
        title: "Missing details",
        description: "Please fill all required fields.",
        variant: "destructive",
      });
      return;
    }

    if (expiryDate && !isDateAfter(expiryDate, issueDate)) {
      toast({
        title: "Invalid expiry date",
        description: "Expiry date must be after the issue date.",
        variant: "destructive",
      });
      return;
    }

    onSubmit(collectData());
  };

  return (
    <Card className="surface-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <span>Certificate Information</span>
        </CardTitle>

        <CardDescription>
          Preview the PDF, then issue the certificate.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={submitForm} className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Student Name *</Label>
              <Input
                placeholder="Enter student name"
                className="bg-background/70"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Student Email *</Label>
              <Input
                type="email"
                placeholder="student@example.com"
                className="bg-background/70"
                value={studentEmail}
                onChange={(e) => handleEmailChange(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Certificate Template</Label>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="completion">Course Completion</SelectItem>
                <SelectItem value="internship">Internship</SelectItem>
                <SelectItem value="participation">Participation</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Course Name *</Label>
              <Input
                placeholder="Enter course name"
                className="bg-background/70"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Issue Date *</Label>
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start bg-card/80 text-left font-normal",
                      !issueDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                    {issueDate ? format(issueDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={issueDate ?? undefined}
                    onSelect={(date) => {
                      const nextDate = parseDateOnly(date);
                      setIssueDate(nextDate);
                      if (nextDate && expiryDate && !isDateAfter(expiryDate, nextDate)) {
                        setExpiryDate(null);
                      }
                      setIsCalendarOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Expiry Date</Label>
              <Popover open={isExpiryCalendarOpen} onOpenChange={setIsExpiryCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!issueDate}
                    className={cn(
                      "w-full justify-start bg-card/80 text-left font-normal",
                      !expiryDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                    {expiryDate
                      ? format(expiryDate, "PPP")
                      : issueDate
                        ? "No expiry"
                        : "Pick issue date first"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={expiryDate ?? undefined}
                    disabled={(date) => !issueDate || isDateOnOrBefore(date, issueDate)}
                    onSelect={(date) => {
                      if (date && issueDate && !isDateAfter(date, issueDate)) {
                        toast({
                          title: "Invalid expiry date",
                          description: "Choose a date after the issue date.",
                          variant: "destructive",
                        });
                        return;
                      }
                      setExpiryDate(parseDateOnly(date));
                      setIsExpiryCalendarOpen(false);
                    }}
                    defaultMonth={expiryDate || issueDate || undefined}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Additional Information</Label>
            <Textarea
              placeholder="Optional"
              className="bg-background/70"
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-[0.8fr_1.2fr]">
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              className="gap-2 bg-card/80"
              onClick={previewCertificate}
            >
              <Eye className="h-4 w-4" />
              Preview PDF
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="font-semibold shadow-[var(--glow-primary)]"
            >
              {isLoading ? "Processing..." : "Issue Certificate"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
