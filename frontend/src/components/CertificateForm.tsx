import React, { useState } from "react";
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
import { CalendarIcon, FileText } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function CertificateForm({ onSubmit, isLoading }: any) {
  const [studentName, setStudentName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [issueDate, setIssueDate] = useState<Date | null>(null);
  const [additionalInfo, setAdditionalInfo] = useState("");

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const submitForm = (e: any) => {
    e.preventDefault();
    if (!studentName || !courseName || !issueDate) {
      alert("Please fill all required fields.");
      return;
    }

    onSubmit({
      studentName,
      courseName,
      issueDate,
      additionalInfo,
    });
  };

  return (
    <Card className="bg-card/50 backdrop-blur-sm border border-border/50 shadow-xl rounded-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-blockchain-primary" />
          <span className="text-white">Certificate Information</span>
        </CardTitle>

        <CardDescription className="text-muted-foreground">
          Fill details to issue certificate automatically
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={submitForm} className="space-y-6">

          {/* Student & Course */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-white">Student Name *</Label>
              <Input
                placeholder="Enter student name"
                className="bg-background border border-border/40 text-white"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white">Course Name *</Label>
              <Input
                placeholder="Enter course name"
                className="bg-background border border-border/40 text-white"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Date Picker */}
          <div className="space-y-2">
            <Label className="text-white">Issue Date *</Label>
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal bg-primary/10 border-primary/30 text-white hover:bg-primary/20 hover:border-primary/50",
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
                    setIssueDate(date ?? null);
                    setIsCalendarOpen(false);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Additional Info */}
          <div className="space-y-2">
            <Label className="text-white">Additional Information</Label>
            <Textarea
              placeholder="Optional"
              className="bg-background border border-border/40 text-white"
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
            />
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-green-500 to-indigo-600 text-white font-semibold"
          >
            {isLoading ? "Processing..." : "Issue Certificate"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
