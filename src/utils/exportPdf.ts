import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { usePrefectStore } from '@/store/prefectStore';

export function exportPDF() {
  const state = usePrefectStore.getState();
  const { sections, dutyPlaces, assignments, prefects } = state;

  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Prefect Duty List', pageWidth / 2, 15, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, 21, { align: 'center' });

  let y = 28;

  for (const section of sections) {
    const sectionDps = dutyPlaces.filter((dp) => dp.sectionId === section.id);
    if (sectionDps.length === 0 && !section.name.includes('SECTION')) continue;

    const head = prefects.find((p) => p.id === section.headId);
    const coHead = prefects.find((p) => p.id === section.coHeadId);

    // Section header
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(section.name, 14, y);
    y += 1;

    if (head || coHead) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      const leaderText = [
        head ? `Head: ${head.name} (${head.regNo})` : '',
        coHead ? `Co-Head: ${coHead.name} (${coHead.regNo})` : '',
      ].filter(Boolean).join('  |  ');
      doc.text(leaderText, 14, y + 4);
      y += 4;
    }

    const rows = sectionDps.map((dp) => {
      const dpAssignments = assignments.filter((a) => a.dutyPlaceId === dp.id);
      const assignedNames = dpAssignments.map((a) => {
        const p = prefects.find((pr) => pr.id === a.prefectId);
        return p ? `${p.name} (G${p.grade}, ${p.gender[0]})` : '—';
      }).join(', ') || '— Vacant —';
      return [dp.name, dp.isSpecial ? 'Special' : 'Class', assignedNames];
    });

    autoTable(doc, {
      startY: y + 2,
      head: [['Duty Place', 'Type', 'Assigned Prefect(s)']],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 41, 69], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 20 } },
      margin: { left: 14, right: 14 },
    });

    y = (doc as any).lastAutoTable.finalY + 6;

    if (y > 260) {
      doc.addPage();
      y = 15;
    }
  }

  // Signature block
  if (y > 240) { doc.addPage(); y = 15; }
  y += 10;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Approved by:', 14, y);
  doc.line(14, y + 15, 80, y + 15);
  doc.text('Board Member Signature', 14, y + 20);
  doc.line(pageWidth - 80, y + 15, pageWidth - 14, y + 15);
  doc.text('Date', pageWidth - 80, y + 20);

  doc.save('Prefect_Duty_List.pdf');
}
