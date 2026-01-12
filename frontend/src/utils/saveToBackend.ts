export const saveToBackend = async (
  data: any,
  certId: string,
  pdfCid: string,
  txHash: string,
  fileName: string
) => {
  const token = localStorage.getItem("adminToken");

  await fetch("http://localhost:5000/api/issue", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      certificateId: certId,
      studentName: data.studentName,
      courseName: data.courseName,
      issueDate: data.issueDate,
      ipfsPdfHash: pdfCid,
      blockchainTx: txHash,
      pdfFileName: fileName, // <-- IMPORTANT
      issuedBy: "Admin",
    }),
  });
};
