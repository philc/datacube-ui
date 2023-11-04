/*
 * A class representing the set of filters currently applied to a TableSet, and a UI class for
 * displaying those filters in a breadcrumb-style UI, with controls for deleting each filter.
 */

class FilterSettings extends EventTarget {
  constructor() {
    super();
    this.filters = {};
  }

  // A map of dimension => [values]
  getFilters() {
    return this.filters;
  }

  setFilters(filters) {
    this.filters = filters;
    this.dispatchEvent(new Event("filterChange"));
  }
}

class FilterSettingsUI {
  // options:
  // - formatters: an optional map of filterName => formattingFn, where formattingFn takes the list
  //   of values which are being filtered, and returns a human readable string representation, to be
  //   shown in the UI.
  constructor(filterSettings, options) {
    this.filterSettings = filterSettings;
    this.formatters = options.formatters || {};
    this.filterSettings.addEventListener("filterChange", () => this.onFilterChanged());
    this.el = document.createElement("div");
    this.el.className = "filter-settings";
    // These "left" and "right" placeholder elements allow the page to insert page-specific text or
    // controls (like a date selector) into the filter bar if desired.
    this.el.innerHTML =
      "<div class='left'></div><div class='filters-container'></div><div class='right'></div>";
    this.filtersContainer = this.el.querySelector(".filters-container");
    this.filtersContainer.addEventListener("click", (e) => this.onClick(e));
    this.redraw();
  }

  redraw() {
    this.filtersContainer.innerHTML = "";

    const stripHtml = (s) => s.replace(/<[^>]*>?/gm, "");

    for (const [key, values] of Object.entries(this.filterSettings.filters)) {
      const filterEl = document.createElement("div");
      filterEl.dataset.dimension = key;
      filterEl.className = "filter";
      filterEl.innerHTML = "<span class='remove'>x</span>";
      const captionEl = document.createElement("span");
      captionEl.className = "caption";
      // Strip any HTML from the formatted values. A common pattern is for formatters to wrap the
      // value in a link, but we don't want to render that link when showing a string representation
      // of the filtered value in the filter UI.
      const formattedValues = values.map((v) =>
        this.formatters[key] ? stripHtml(this.formatters[key](v)) : v
      );
      let caption = formattedValues.join(", ");
      // If the caption is too long, show a tooltip containing the full caption.
      if (caption.length > 20) {
        captionEl.title = caption.substring(0, 200);
        caption = `${values.length} ${DataTable.formatColumnName(key)}`;
      }
      captionEl.textContent = caption;
      filterEl.appendChild(captionEl);
      this.filtersContainer.appendChild(filterEl);
    }
  }

  // When a remove button is clicked, remove that filter from `filterSettings`.
  onClick(event) {
    if (event.target.className == "remove") {
      const filterEl = event.target.parentNode;
      const dimen = filterEl.dataset.dimension;
      const filters = this.filterSettings.getFilters();
      delete filters[dimen];
      this.filterSettings.setFilters(filters);
    }
  }

  onFilterChanged() {
    this.redraw();
  }
}

export { FilterSettings, FilterSettingsUI };
