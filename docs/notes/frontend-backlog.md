* Storage
    * Registry
        * PV-settings
    * Currently stored analyses
* Need a way to close/minimize/restore open games; maybe take inspiration from tab manager extensions for firefox
* ownership maps and policy head outputs (generic overlay that can be used with both ownership and policy)
    * policy map overlay requires mapping linear indices to board 2d indices
        * probably should implement a middleware extension for this
* PV's should be mouse-scrollable (as in the animated versions of the PV display but optionally done manually using the scroll-wheel)
* PV's should be pasteable into the game-tree
* Seek to off-load some styling/layout to existing libraries in the javascript/typescript/vue eco-system (grid-layout, monaco editor, etc, etc, not sure what's out there)
* When connection with KataGo has been established, should send query_version and query_models in order to display relevant information in the status bar; if connection drops and is re-established,
  should probe again to cover the case where the KataGo service change configuration

---

Bugs or other rough edges

* useUserIORegistry interacts with keyboard handling elsewhere. For example, in the Monaco editor, bound keys in UserIO can not be used which is obviously a blocker
* After spaced repetition when the game rewinds to initial position, when entering intermission, you can't click on the chart like on the PlayerPanel (actually, if PlayerPanel isn't reused, why is that? should it be?)
* When hovering PV, still shows text annotation (like number of visit or scoreLead), but shouldn't
* Need an override for visits in SR; card metadata should be displayed for active review sessions
* Need a card editor; probably there is going to be some DRY/reuse related to the above
* Disconnect button styling (right now just shows ENGINE in green)
* The analysis done and displayed in the SR tab seems to be independent of that in the analysis tab. This is probably not ever desirable
* The analysis range is not preserved when switching tabs or switching between boards, etc, which is highly annoying.

