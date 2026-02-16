// Shared state for the sticky footer toolbar.
// Search query lives here so both the toolbar (input) and pages (results) can access it.

class ToolbarState {
  searchOpen = $state(false);
  searchQuery = $state("");

  closeSearch() {
    this.searchOpen = false;
    this.searchQuery = "";
  }

  openSearch() {
    this.searchOpen = true;
  }

  setSearch(query: string) {
    this.searchQuery = query;
  }
}

export const toolbarState = new ToolbarState();
