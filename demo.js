import { DataCube } from "https://www.philcrosby.com/datacube.js/datacube.js";
import { formatters } from "https://www.philcrosby.com/datatable.js/datatable.js";
import { TableSet } from "./tableset.js";
import { FilterSettingsUI } from "./filter_settings.js";

function createRowsFixture() {
  const count = 100;
  const rows = [];
  const countries = ["CHN", "IND", "USA", "IDN", "PAK", "BRA", "NGA", "BGD", "RUS", "MEX"];
  const pages = ["index.html", "signup.html", "about.html", "pricing.html"];
  const browsers = [
    "Chrome",
    "Safari",
    "Edge",
    "Firefox",
  ];
  const operatingSystems = [
    "iOS",
    "Android",
    "Windows",
    "MacOS",
    "Linux",
  ];

  function logisticFunction(x) {
    return 1 / (1 + Math.exp(-x));
  }

  for (let i = 0; i < count; i++) {
    rows.push({
      page: pages[i*3 % pages.length],
      country: countries[i % countries.length],
      browser: browsers[i % browsers.length],
      os: operatingSystems[i % operatingSystems.length],
      impressions: i * 123,
      clicks: i * 11,
      signups: i,
    });
  }
  return rows;
}

function init() {
  const dimens = ["page", "country", "browser", "os"];
  const metrics = ["impressions", "clicks", "signups"];
  const dc = new DataCube(dimens, metrics);
  for (const row of createRowsFixture()) {
    dc.addRow(row);
  }

  const tableSet = new TableSet(dc, {
    charts: dimens,
    formatters: {
      impressions: formatters.thousands,
      clicks: formatters.fixed0,
      signups: formatters.fixed0
    }
  });

  document.body.appendChild(tableSet.el);
}

document.addEventListener("DOMContentLoaded", init);
