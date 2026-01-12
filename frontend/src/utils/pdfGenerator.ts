import QRCode from "qrcode";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { format } from "date-fns";

export const generateCertificatePDF = async (data: any, certId: string): Promise<File> => {
  const studentName = data?.studentName?.trim() || "Student";
  const courseName = data?.courseName || "Course";
  const issueDate = data?.issueDate || new Date();

  const bgPattern = "/assets/bg_pattern.png";
  const logoLeft = "/assets/logo_left.png";
  const logoRight = "/assets/logo_right.png";

  // ⭐ Reduce size for faster PDF + faster upload
  const WIDTH = 1200;
  const HEIGHT = 850;

  const container = document.createElement("div");
  container.style.width = WIDTH + "px";
  container.style.height = HEIGHT + "px";
  container.style.position = "fixed";
  container.style.left = "-99999px";
  container.style.top = "0";
  container.style.background = `url(${bgPattern}) center/cover no-repeat`;
  container.style.fontFamily = "'Times New Roman', serif";
  container.style.color = "#000";
  container.style.display = "flex";
  container.style.flexDirection = "column";

  // Outer border
  const outer = document.createElement("div");
  outer.style.position = "absolute";
  outer.style.inset = "14px";
  outer.style.border = "5px solid #4b4b4b";
  container.appendChild(outer);

  // Inner border
  const inner = document.createElement("div");
  inner.style.position = "absolute";
  inner.style.inset = "28px";
  inner.style.border = "8px solid #d4af37";
  container.appendChild(inner);

  // HEADER
  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.style.padding = "40px 80px 10px 80px";

  header.innerHTML = `
    <img src="${logoLeft}" style="height:140px;" />
    <div style="text-align:center;">
      <div style="font-size:38px; font-weight:700;">Narula Institute of Technology</div>
      <div style="font-size:22px;">Under JIS University</div>
    </div>
    <img src="${logoRight}" style="height:140px;" />
  `;
  container.appendChild(header);

  // BODY
  const body = document.createElement("div");
  body.style.flex = "1";
  body.style.textAlign = "center";

  body.innerHTML = `
    <div style="font-size:38px; color:#b48802; font-weight:600;">Certificate of Achievement</div>
    <div style="font-size:20px; margin-top:16px;">This is to certify that</div>

    <div style="font-size:40px; margin-top:15px; font-weight:700;">${studentName.toUpperCase()}</div>

    <div style="font-size:24px; margin-top:10px;">has successfully completed the course</div>

    <div style="font-size:30px; margin-top:12px; font-weight:700;">${courseName.toUpperCase()}</div>

    <div style="font-size:18px; margin-top:30px;">
      Issued on: ${format(issueDate, "MMMM do, yyyy")} <br/>
      Certificate ID: ${certId}
    </div>
  `;
  container.appendChild(body);

  // FOOTER
  const footer = document.createElement("div");
  footer.style.display = "flex";
  footer.style.justifyContent = "space-between";
  footer.style.alignItems = "center";
  footer.style.padding = "0 50px 40px 50px";

  const left = document.createElement("div");
  left.style.fontSize = "16px";
  left.style.fontStyle = "italic";
  left.innerText = "Authorized by Blockchain Certificate System";

  const qr = document.createElement("div");
  qr.style.textAlign = "center";
  qr.innerHTML = `
    <canvas id="qrCanvas" width="120" height="120"></canvas>
    <div style="margin-top:6px; font-size:14px;">Scan to Verify</div>
  `;

  footer.appendChild(left);
  footer.appendChild(qr);
  container.appendChild(footer);

  document.body.appendChild(container);

  // Generate QR
  const qrCanvas = container.querySelector("#qrCanvas") as HTMLCanvasElement;
  await QRCode.toCanvas(qrCanvas, `${window.location.origin}/verify/${certId}`, {
    width: 120,
    margin: 1,
  });

  const canvas = await html2canvas(container, { scale: 1, useCORS: true });

  const img = canvas.toDataURL("image/png");

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "px",
    format: [WIDTH, HEIGHT],
  });

  pdf.addImage(img, "PNG", 0, 0, WIDTH, HEIGHT);

  const blob = pdf.output("blob");
  document.body.removeChild(container);

  return new File([blob], `${studentName.replace(/\s+/g, "_")}_Certificate.pdf`, {
    type: "application/pdf",
  });
};
