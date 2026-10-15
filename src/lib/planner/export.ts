import { itemCredits, semesterCredits, semesterLabel } from "./plan";
import type { Course, Plan } from "./types";

// Downloads of a plan. The Excel library is large, so it loads only when someone asks for a file.

const csvCell = (text: string) => (/[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text);

function rows(plan: Plan, courses: Map<string, Course>, completed: Set<string>) {
  const out: (string | number)[][] = [];
  plan.forEach((items, s) => {
    for (const item of items) {
      const course = item.course ? courses.get(item.course) : undefined;
      out.push([semesterLabel(s), course?.code ?? item.slot ?? item.course ?? "", course?.title ?? "", itemCredits(item, courses), course && completed.has(course.id) ? "Yes" : ""]);
    }
  });
  return out;
}

const HEADER = ["Semester", "Course", "Title", "Credits", "Completed"];

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(plan: Plan, courses: Map<string, Course>, completed: Set<string>, name: string) {
  const text = [HEADER, ...rows(plan, courses, completed)].map((r) => r.map((c) => csvCell(String(c))).join(",")).join("\n");
  save(new Blob([text], { type: "text/csv" }), `${name}.csv`);
}

export async function downloadExcel(plan: Plan, courses: Map<string, Course>, completed: Set<string>, name: string, title: string) {
  const { Workbook } = await import("exceljs");
  const book = new Workbook();
  const sheet = book.addWorksheet("Degree plan");
  sheet.addRow([title]).font = { bold: true, size: 14 };
  sheet.addRow([]);
  sheet.addRow(HEADER).font = { bold: true };
  let total = 0;
  plan.forEach((items, s) => {
    for (const row of rows([items], courses, completed)) sheet.addRow([semesterLabel(s), ...row.slice(1)]);
    const credits = semesterCredits(items, courses);
    total += credits;
    const subtotal = sheet.addRow([semesterLabel(s), "", "Semester total", credits, ""]);
    subtotal.font = { italic: true };
  });
  sheet.addRow([]);
  sheet.addRow(["", "", "All semesters", total, ""]).font = { bold: true };
  sheet.columns = [{ width: 18 }, { width: 14 }, { width: 50 }, { width: 10 }, { width: 12 }];
  const buffer = await book.xlsx.writeBuffer();
  save(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${name}.xlsx`);
}
