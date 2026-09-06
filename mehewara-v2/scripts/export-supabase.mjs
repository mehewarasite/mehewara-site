const url = process.env.MIGRATION_SOURCE_SUPABASE_URL.replace(/\/$/, "");
const key = process.env.MIGRATION_SOURCE_SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function fetchTable(table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*`, { headers });
  if (!res.ok) throw new Error(`Failed to fetch ${table}: ${res.status}`);
  return res.json();
}

async function main() {
  const data = {
    source: "supabase",
    subjects: await fetchTable("subjects"),
    papers: await fetchTable("papers"),
    questions: await fetchTable("questions"),
    studyHtml: await fetchTable("study_html"),
    gallery: await fetchTable("gallery"),
    siteVisits: await fetchTable("site_visits"),
    attempts: [], // as per runbook, local only
    publicationHistory: [] // manual replay
  };
  
  const aboutUs = await fetchTable("about_us");
  if (aboutUs.length > 0) {
    data.about = aboutUs[0];
  }
  
  const fs = await import("fs");
  fs.writeFileSync("legacy-export.json", JSON.stringify(data, null, 2));
  console.log("Exported to legacy-export.json");
}

main().catch(console.error);
