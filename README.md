# BVG Fit

A static uniform calendar for Bayview Glen Lower School parents. The page offers week and Sunday-first month views; the month grid includes adjacent-month dates. `data/catalog.json` lists available years and classes, and `data/<school-year>/<grade>/<class>_schedule.json` contains the public daily results. `engine.mjs` holds the underlying rule logic.

## Confirmed uniform rules

The [BVG 2026–27 JK–Grade 2 uniform guide](https://www.bayviewglen.ca/wp-content/uploads/2026/07/Bayview-Glen-Lower-School-JK-Gr2-Uniforms-202627.pdf) says:

- Gym uniform is worn **all day on scheduled gym days**, which normally occur every second school day.
- **First Dress is required on Fridays for assembly**, except when the class has gym that day. Thus Friday + gym means gym uniform; Friday + no gym means First Dress, not ordinary class uniform. The current guide still explicitly says “Every Friday throughout the year for Assembly.” A newer school notice would supersede that guide if the practice changes.
- First Dress is also required on orientation day and designated special occasions. The school guide describes class uniform for other non-gym days. Seasonal summer/winter versions affect the clothing items, but the parent-facing calendar labels both simply **Class uniform**.

Apply explicit dated school or class notices before the recurring pattern. In particular, closures show **No school**, a confirmed civvies day shows **Civvies**, and a mandatory First Dress notice such as a photo or special assembly day shows **First Dress**. Do not infer a mandatory First Dress day merely from the presence of a calendar event unless its notice specifies the clothing requirement.

The parent confirmed for **all Lower School classes** that November 11, 2026 (Remembrance Day) is First Dress, November 18 begins winter uniform, and November 26 is Civvies Day. The winter change affects which uniform items are worn, not the calendar's Class uniform label. These are date-specific facts, not recurring rules.

## School-day cycle and class coverage

The school's printed calendar labels regular instructional days **Day 1** through **Day 8**. The sequence advances on school days, not weekends or closures. An occasional **Day 9** is a special/flex day: display Day 9 but do not extrapolate the regular gym rotation onto it. Use its specific class notice for attire; if none is confirmed, show **Check class notice**. Date-specific closures and exceptions must be checked against the school calendar before assigning a uniform.

## How to maintain the data

- Treat the current year's published BVG uniform guide, school calendar, and newer dated school/class notices as the source of truth. Historical guides are useful context but may be out of date.
- Keep the school-day sequence, class PE schedule, and dated uniform exceptions separate. A new school year should get its own catalog entry and `data/<school-year>/<grade>/` files; each class has its own schedule file.
- Keep `notes` mostly empty. Put the uniform and, where useful, the day number in the visible calendar entry; add short notes only when a date-specific detail helps parents.
- Publish only the small, parent-facing schedule data. Do not copy Edsby messages, teacher/student names, login details, or private research material into the public repository. Check generated JSON and any calendar feed for personal information before publishing.

The website currently consumes precomputed schedule JSON. Changes to `engine.mjs` alone do **not** change what visitors see; the corresponding class schedule JSON must also be regenerated or edited. This README records the current understanding and should be revisited when a newer school notice conflicts with it.
