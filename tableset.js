/*
 * A UI for renderinga a DataCube, where each dimension is rendered by a separate DataTable.
 *
 * See also: https://www.github.com/philc/datacube.js and https://www.github.com/philc/datatable.js.
 */

import * as filters from "./filter_settings.js";
import { DataTable } from "https://www.philcrosby.com/datatable.js/datatable.js";

class TableSet extends EventTarget {
  // options:
  // - charts: a list of charts. A "chart" can be just a string indicating the dimension to render,
  //   or it can be an array of [dimensionName, layoutOptions, chartOptions].
  //   - layoutOptions: an object with fields: column
  //   - chartOptions: an object that is passed to the underlying DataTable. See DataTable's
  //     constructor.
  // - sort: map of { column: order }. `order` can be either "asc" or "desc".
  // - columnNames: a map of { column: display-name } for the columns provided in `columns`.
  // - columns: the subset of columns (i.e. metrics) to display in each table. The dimension for
  //   each data table will be prepended to this list.
  // - renderFn: optional. A function which takes (rows, datacube) and returns an array of rows
  //   for display purposes. The primary use case is for the caller to add in derived metrics for
  //   each row, e.g. click through rate, using the row's impression and click counts.
  // Note that "totals" is a valid, special-cased dimension, and it will render the totals for the
  // entire DataCube.
  constructor(dataCube, options) {
    super();
    if (!options) throw new Error("`options` cannot be null.");
    if (!options.charts) throw new Error("`options.charts` cannot be null.");

    this.renderFn = options.renderFn;
    this.dataCube = dataCube;
    // NOTE(philc): We store this filtered data cube so that others can use it without having to
    // redo the filtering computation. The tableSet doesn't need to retain this after the tables are
    // finished drawing, so retaining this is a tradeoff between memory usage vs. programmer
    // convenience and saved computation.
    this.dataCubeFiltered = dataCube;

    this.el = document.createElement("div");
    this.el.classList.add("tableset");

    this.filterSettings = new filters.FilterSettings();
    this.filterSettings.addEventListener("filterChange", () => this.onFilterChanged());

    this.filterSettingsUI = new filters.FilterSettingsUI(this.filterSettings, {
      formatters: options.formatters,
    });
    this.el.appendChild(this.filterSettingsUI.el);

    const columnsEl = document.createElement("div");
    columnsEl.classList.add("columns");
    this.el.appendChild(columnsEl);

    const createColumnEl = (columnNumber) => {
      const el = document.createElement("div");
      el.classList.add("column" + columnNumber);
      el.classList.add("column");
      columnsEl.appendChild(el);
      return el;
    };

    const column0 = createColumnEl(0);

    this.dataTables = [];
    this.charts = options.charts;

    const defaultTableOpts = {
      formatters: options.formatters,
      columnNames: options.columnNames,
      sort: options.sort,
    };

    for (const o of options.charts) {
      let dimen, layoutOpts, chartOpts;
      if (typeof o == "string") {
        dimen = o;
      } else {
        [dimen, layoutOpts, chartOpts] = o;
      }

      chartOpts = chartOpts || {};

      if (options.columns) {
        chartOpts.columns = [dimen].concat(options.columns);
      }

      const clickableColumns = dimen == "totals" ? [] : [dimen];
      const dt = new DataTable(
        Object.assign(
          { ...defaultTableOpts, clickableColumns: clickableColumns },
          chartOpts,
        ),
      );
      dt.dimen = dimen;
      dt.el.dataset.dimen = dimen;
      if (dimen != "totals") {
        dt.addEventListener("cellClick", (e) => this.onCellClick(e));
      }
      dt.addEventListener("graphButtonClick", (e) => this.dispatchEvent(e));
      dt.addEventListener("sortChange", (e) => this.onSortChange(e));
      this.dataTables.push(dt);

      layoutOpts = layoutOpts || {};
      if (layoutOpts.column) {
        // TODO(philc): there's a bug here where if a chart has more than two columns, and the third
        // column appears first in the list of charts, then it will get added to the DOM ahead of
        // column 2.
        let el = this.el.querySelector(".column" + layoutOpts.column);
        if (!el) el = createColumnEl(layoutOpts.column);
        el.appendChild(dt.el);
      } else {
        column0.appendChild(dt.el);
      }
    }

    this.redraw();
  }

  onCellClick(event) {
    const column = event.detail.column;
    const value = event.detail.value;
    // TODO(philc): This may not be correct. I think we want to check this.charts?
    if (!this.dataCube.dimens.includes(event.detail.column)) return;
    const filters = this.filterSettings.getFilters();
    const action = event.detail.action;
    if (action == "select") {
      filters[column] = [value];
    } else if (action == "toggle") {
      if (!filters[column]) {
        // TODO(philc): There should be a more efficient way to get a dimension's values.
        const dimenValues = this.dataCube
          .select([column])
          .getRows()
          .map((row) => row[column]);
        filters[column] = dimenValues.filter((v) => v != value);
      } else if (filters[column].includes(value)) {
        filters[column] = filters[column].filter((v) => v != value);
        // Once all dimension values have been removed from the filtered set, remove the entire
        // filter.
        if (filters[column].length == 0) {
          delete filters[column];
        }
      } else {
        filters[column].push(value);
      }
    }
    this.filterSettings.setFilters(filters);
  }

  onSortChange(event) {
    for (const dt of this.dataTables) {
      dt.setSortOptions(event.detail.sort);
    }
    this.redraw();
  }

  redraw() {
    const filters = this.filterSettings.filters;

    // Render the totals table. There's only 1 row.
    const renderTotalsRow = (dt) => {
      const dc = Bench.time("select", () => this.dataCubeFiltered.select([]));
      let totalsRow = dc.getRows()[0];
      // Create a dimension key. It must be the first key in the map for it to show up as the first column.
      totalsRow = Object.assign({ totals: "" }, totalsRow);
      dt.renderRows(this.renderFn([totalsRow], dc));
    };

    for (const dt of this.dataTables) {
      const dimen = dt.dimen;
      if (dimen == "totals") {
        renderTotalsRow(dt);
        continue;
      }

      let dc;
      let isSelectedFn = null;

      // When there's a filter on this table's dimension, render the table without that filter so that all
      // rows for this dimension can be shown. Then, we will gray out any rows which do not match the filter.
      if (filters[dimen] == null) {
        dc = this.dataCubeFiltered;
      } else {
        const newFilters = Object.fromEntries(
          Object.entries(filters).filter(([k, _]) => k != dimen),
        );
        dc = this.dataCube.where(newFilters);
        isSelectedFn = (row) => filters[dimen].includes(row[dimen]);
      }

      dc = dc.select([dimen]);
      const rows = dc.getRows();
      // TODO(philc): Assert that the caller function returns an array.
      const renderedRows = this.renderFn ? this.renderFn(rows, dc) : rows;
      dt.renderRows(renderedRows, isSelectedFn);
    }
    if (this.el.parentNode) this.syncNumericColumnWidths();
  }

  // This should be called after the tableset's element is added to the DOM.
  relayout() {
    this.syncNumericColumnWidths();
  }

  // Within each column, make all numeric columns of the same name equal width, so they line up visually
  // across tables.
  syncNumericColumnWidths() {
    const columnEls = this.el.querySelectorAll(".column");
    for (const columnEl of columnEls) {
      const columnToWidth = {};
      const ths = columnEl.querySelectorAll("th.number");
      for (const th of ths) {
        const col = th.dataset.column;
        const width = th.offsetWidth;
        if (!columnToWidth[col] || width > columnToWidth[col]) {
          columnToWidth[col] = width;
        }
      }
      for (const th of ths) {
        th.style.minWidth = columnToWidth[th.dataset.column] + "px";
      }
    }
  }

  onFilterChanged() {
    this.dataCubeFiltered = this.dataCube.where(this.filterSettings.filters);
    this.redraw();
  }
}

export { TableSet };
