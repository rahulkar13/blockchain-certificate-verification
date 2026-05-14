import QRCode from "qrcode";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { format } from "date-fns";
import { parseDateOnly } from "@/utils/dateOnly";

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatCertificateDate = (value: Date | string | number) => {
  const date = parseDateOnly(value);
  return date ? format(date, "MMM d, yyyy") : "Not set";
};

const titleCase = (value = "") =>
  value
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const img = (src: string, alt: string, style: string) =>
  `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" draggable="false" style="${style}" />`;

export const generateCertificatePDF = async (data: any, certId: string): Promise<File> => {
  const studentName = data?.studentName?.trim() || "Student";
  const courseName = data?.courseName || "Course";
  const issueDate = parseDateOnly(data?.issueDate) || new Date();
  const expiryDate = parseDateOnly(data?.expiryDate);
  const template = data?.template === "achievement" ? "completion" : data?.template || "completion";
  const branding = data?.branding || {};
  const verifyUrl = `${window.location.origin}/verify/${encodeURIComponent(certId)}`;
  const templates: Record<string, { label: string; title: string; line: string; footer: string }> = {
    completion: {
      label: "Course Completion",
      title: "Certificate of Completion",
      line: "has completed all requirements for",
      footer: "Verified course completion record",
    },
    internship: {
      label: "Internship",
      title: "Internship Certificate",
      line: "has successfully completed the internship program",
      footer: "Authorized internship credential",
    },
    participation: {
      label: "Participation",
      title: "Certificate of Participation",
      line: "has actively participated in",
      footer: "Verified participation credential",
    },
  };

  const selectedTemplate = templates[template] || templates.completion;
  const defaultTemplateTitles = [
    "certificate of achievement",
    ...Object.values(templates).map((item) => item.title.toLowerCase()),
  ];
  const defaultTemplateLines = [
    "has successfully completed the course",
    ...Object.values(templates).map((item) => item.line.toLowerCase()),
  ];
  const brandingTitle = String(branding.certificateTitle || "").trim();
  const brandingBody = String(data?.certificateText || branding.certificateBody || "").trim();
  const titleIsOnlyDefault =
    !brandingTitle || defaultTemplateTitles.includes(brandingTitle.toLowerCase());
  const bodyIsOnlyDefault =
    !brandingBody || defaultTemplateLines.includes(brandingBody.toLowerCase());
  const certificateTitle = titleCase(
    titleIsOnlyDefault ? selectedTemplate.title : brandingTitle
  );
  const certificateBody = bodyIsOnlyDefault ? selectedTemplate.line : brandingBody;
  const certificateFooter = branding.certificateFooter || selectedTemplate.footer;
  const instituteName = String(branding.instituteName || "").trim();
  const instituteAddress = String(branding.instituteAddress || "").trim();
  const logoImage = String(branding.logoDataUrl || "").trim();
  const stampImage = String(branding.stampDataUrl || "").trim();
  const certificateSealImage = "/assets/certificate-seal-red-transparent.png";
  const bgPattern = "/assets/bg_pattern.png";

  const WIDTH = 1200;
  const HEIGHT = 850;
  const gold = "#b88a1a";
  const deepGold = "#7a5512";
  const ink = "#15110b";
  const muted = "#514331";
  const teal = "#158f8f";

  const container = document.createElement("div");
  container.style.width = `${WIDTH}px`;
  container.style.height = `${HEIGHT}px`;
  container.style.position = "fixed";
  container.style.left = "-99999px";
  container.style.top = "0";
  container.style.overflow = "hidden";
  container.style.background = "#fbf3d4";
  container.style.fontFamily = "'Times New Roman', Georgia, serif";
  container.style.color = ink;

  container.innerHTML = `
    <div style="position:absolute;inset:0;background:
      linear-gradient(180deg, rgba(255,253,244,0.94), rgba(248,238,202,0.96)),
      url(${escapeHtml(bgPattern)}) center/cover no-repeat;"></div>

    <div style="position:absolute;inset:0;background:
      radial-gradient(circle at 10% 12%, rgba(184,138,26,0.12), transparent 250px),
      radial-gradient(circle at 88% 84%, rgba(21,143,143,0.1), transparent 230px);"></div>

    <div style="position:absolute;inset:28px;border:4px solid ${gold};"></div>

    <header style="position:relative;z-index:2;display:grid;grid-template-columns:300px 1fr 300px;align-items:center;padding:32px 58px 0;">
      <div style="display:flex;align-items:center;justify-content:center;">
        <div style="width:260px;height:180px;display:flex;align-items:center;justify-content:center;">
          ${
            logoImage
              ? img(logoImage, "Institute logo", "max-width:250px;max-height:172px;object-fit:contain;")
              : ""
          }
        </div>
      </div>

      <div style="text-align:center;padding:0 18px;">
        ${
          instituteName
            ? `<div style="font-size:39px;line-height:1.05;font-weight:800;color:${ink};">${escapeHtml(instituteName)}</div>`
            : ""
        }
        ${
          instituteAddress
            ? `<div style="font-size:17px;margin-top:7px;color:${muted};">${escapeHtml(instituteAddress)}</div>`
            : ""
        }
      </div>

      <div style="display:flex;align-items:center;justify-content:center;">
        <div style="width:260px;height:180px;display:flex;align-items:center;justify-content:center;">
          ${
            stampImage
              ? img(stampImage, "Institute stamp", "max-width:250px;max-height:172px;object-fit:contain;")
              : ""
          }
        </div>
      </div>
    </header>

    <main style="position:relative;z-index:2;text-align:center;padding:24px 112px 0;">
      <div style="font-size:16px;letter-spacing:0.28em;text-transform:uppercase;color:${deepGold};font-weight:800;">Certificate</div>
      <div style="margin-top:18px;font-size:48px;line-height:1;color:${deepGold};font-weight:800;">${escapeHtml(certificateTitle)}</div>

      <div style="margin-top:34px;font-size:20px;color:${muted};">This certificate is proudly presented to</div>
      <div style="margin:18px auto 0;max-width:760px;">
        <div style="font-size:51px;line-height:1.05;font-weight:900;letter-spacing:0.08em;color:${ink};">${escapeHtml(studentName.toUpperCase())}</div>
      </div>

      <div style="margin-top:24px;font-size:24px;color:${muted};">${escapeHtml(certificateBody)}</div>
      <div style="margin-top:13px;font-size:35px;line-height:1.12;font-weight:800;color:${ink};">${escapeHtml(courseName.toUpperCase())}</div>

      <div style="display:flex;justify-content:center;gap:42px;margin-top:36px;">
        <div style="min-width:150px;">
          <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${deepGold};font-weight:800;">Issued On</div>
          <div style="font-size:15px;margin-top:5px;font-weight:700;color:${ink};">${formatCertificateDate(issueDate)}</div>
        </div>
        ${
          expiryDate
            ? `<div style="min-width:150px;">
                <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${deepGold};font-weight:800;">Valid Until</div>
                <div style="font-size:15px;margin-top:5px;font-weight:700;color:${ink};">${formatCertificateDate(expiryDate)}</div>
              </div>`
            : ""
        }
        <div style="min-width:150px;">
          <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${deepGold};font-weight:800;">Certificate ID</div>
          <div style="font-size:15px;margin-top:5px;font-weight:700;color:${ink};">${escapeHtml(certId)}</div>
        </div>
        <div style="min-width:150px;">
          <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${deepGold};font-weight:800;">Credential Type</div>
          <div style="font-size:15px;margin-top:5px;font-weight:700;color:${ink};">${escapeHtml(selectedTemplate.label)}</div>
        </div>
      </div>
    </main>

    <footer style="position:absolute;z-index:2;left:78px;right:78px;bottom:50px;display:grid;grid-template-columns:330px 1fr 210px;align-items:end;gap:30px;">
      <section style="font-size:14px;color:${muted};">
        <div style="height:54px;display:flex;align-items:flex-end;">
          ${
            branding.signatureDataUrl
              ? img(branding.signatureDataUrl, "Authorized signature", "display:block;max-width:210px;max-height:48px;object-fit:contain;")
              : `<div style="height:38px;"></div>`
          }
        </div>
        <div style="margin-top:9px;font-weight:800;color:${ink};">Authorized Signature</div>
        <div style="margin-top:5px;font-style:italic;">${escapeHtml(certificateFooter)}</div>
        ${
          branding.instituteWebsite
            ? `<div style="margin-top:7px;color:${teal};font-weight:700;">${escapeHtml(branding.instituteWebsite)}</div>`
            : ""
        }
      </section>

      <section style="height:142px;display:flex;align-items:flex-end;justify-content:center;">
        ${img(certificateSealImage, "Original certificate seal", "display:block;width:138px;height:148px;object-fit:contain;opacity:0.94;transform:rotate(-5deg);")}
      </section>

      <section style="width:150px;justify-self:end;text-align:center;">
        <canvas id="qrCanvas" width="116" height="116" style="display:block;width:116px;height:116px;margin:0 auto;"></canvas>
        <div style="width:150px;margin-top:7px;text-align:center;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;font-weight:800;color:${ink};">Scan to Verify</div>
      </section>
    </footer>
  `;

  document.body.appendChild(container);

  const qrCanvas = container.querySelector("#qrCanvas") as HTMLCanvasElement;
  await QRCode.toCanvas(qrCanvas, verifyUrl, {
    width: 116,
    margin: 1,
  });

  const canvas = await html2canvas(container, { scale: 1, useCORS: true });
  const image = canvas.toDataURL("image/jpeg", 0.9);

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "px",
    format: [WIDTH, HEIGHT],
  });

  pdf.addImage(image, "JPEG", 0, 0, WIDTH, HEIGHT, undefined, "FAST");
  const blob = pdf.output("blob");
  document.body.removeChild(container);

  return new File([blob], `${studentName.replace(/\s+/g, "_")}_Certificate.pdf`, {
    type: "application/pdf",
  });
};
