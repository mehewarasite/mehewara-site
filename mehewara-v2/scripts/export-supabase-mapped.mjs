const url = process.env.MIGRATION_SOURCE_SUPABASE_URL.replace(/\/$/, "");
const key = process.env.MIGRATION_SOURCE_SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function fetchTable(table) {
  let allRows = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=${limit}&offset=${offset}`, { headers });
    if (!res.ok) throw new Error(`Failed to fetch ${table}: ${res.status}`);
    const rows = await res.json();
    allRows = allRows.concat(rows);
    if (rows.length < limit) break;
    offset += limit;
  }
  return allRows;
}

async function main() {
  const rawSubjects = await fetchTable("subjects");
  const rawPapers = await fetchTable("papers");
  const rawQuestions = await fetchTable("questions");
  const rawStudyHtml = await fetchTable("study_html");
  const rawGallery = await fetchTable("gallery");
  const rawSiteVisits = await fetchTable("site_visits");
  const rawAboutUs = await fetchTable("about_us");

  const subjects = rawSubjects.map(row => {
    let d = row.data;
    if (!d.name) d.name = "Unknown Subject";
    if (!d.sinhalaName) d.sinhalaName = d.name;
    return d;
  });
  const papers = rawPapers.map(row => {
    let d = row.data;
    if (!d.title) d.title = "Unknown Paper";
    if (!d.sinhalaTitle) d.sinhalaTitle = d.title;
    return d;
  });
  const questions = rawQuestions.map(row => row.data);

  const studyHtml = rawStudyHtml.map(row => ({
    paperId: row.paper_id,
    html: row.html
  }));

  const gallery = rawGallery.map(row => ({
    id: row.id,
    title: row.title && row.title.trim() ? row.title : "Untitled",
    sinhalaTitle: row.title && row.title.trim() ? row.title : "Untitled",
    description: row.description || "No description",
    descriptionSinhala: row.description || "No description",
    imageHex: row.image_hex,
    mimeType: row.mime_type,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    pinned: row.pinned
  }));

  const siteVisits = rawSiteVisits.map(row => ({
    id: row.id,
    visitedAt: row.visited_at,
    path: row.path
  }));
  
  let about = null;
  if (rawAboutUs.length > 0) {
    const row = rawAboutUs[0];
    about = {
      description: row.description,
      image_url: row.image_url,
      facebook_link: row.facebook_link,
      youtube_link: row.youtube_link,
      linkedin_link: row.linkedin_link,
      privacy_policy_statement: row.privacy_policy_statement,
      full_privacy_policy_html: row.full_privacy_policy_html
    };
  }

  const data = {
    source: "supabase",
    subjects,
    papers,
    questions,
    studyHtml,
    gallery,
    siteVisits,
    attempts: [],
    publicationHistory: []
  };
  if (about) {
    data.about = about;
  }
  
  const fs = await import("fs");
  fs.writeFileSync("legacy-export.json", JSON.stringify(data));
  console.log("Exported to legacy-export.json");
}
main().catch(console.error);
