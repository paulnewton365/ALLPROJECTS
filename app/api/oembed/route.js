const { NextResponse } = require("next/server");

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url") || "https://allprojects-kappa.vercel.app";
  const maxwidth = parseInt(searchParams.get("maxwidth")) || 1200;
  const maxheight = parseInt(searchParams.get("maxheight")) || 900;

  const response = {
    version: "1.0",
    type: "rich",
    title: "Antenna Group — All Projects Dashboard",
    description: "Live project status, financials, and pipeline from Smartsheet",
    provider_name: "Antenna Group",
    provider_url: "https://allprojects-kappa.vercel.app",
    width: maxwidth,
    height: maxheight,
    html: `<iframe src="${url}" width="${maxwidth}" height="${maxheight}" style="border:none;" title="Antenna Group Dashboard" loading="lazy"></iframe>`,
  };

  return NextResponse.json(response, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  });
}
