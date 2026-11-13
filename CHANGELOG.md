# Changelog

What changed in Village Sqwhere, newest first. Every pull request that changes behaviour,
setup or docs adds one line under the date it merges, in the same words as its title, with
its number:

```text
- feat(api): add idea embedding endpoint (#12)
```

## 2026-11-13

- feat(api): show on the hub card when a developer may ask again (#130)
- fix(api): show the demo people as verified (#126)
- feat(web): say when a declined developer can ask again (#125)
- fix(web): load the profile in the frame when no screen has (#124)
- feat(api): make a turned-down developer wait before asking again (#123)
- fix(api): refuse to seed the demo where it is switched off (#122)
- feat(web): add asking to join a hub (#121)
- feat(api): add made-up content for the demo (#120)
- feat(web): open the read-only demo from the landing page (#119)
- feat(web): save the sectors chosen in onboarding (#118)
- feat(api): keep demo content and real content apart (#117)
- feat(api): let developers ask to join a hub (#116)
- feat(api): add a read-only demo sign-in (#115)
- feat(api): add sectors for onboarding (#114)
- test(api): compare saved lists without order in the two tabs test (#113)
- fix(api): answer 422 instead of 500 for a lone surrogate in a request (#112)
- feat(web): ask in onboarding what the feed should show (#111)
- feat(web): add liking a comment (#109)
- test(web): answer the sign-in request only after it is sent (#110)
- feat(web): add comments and replies on a post (#108)
- feat(web): choose the topics of your feed (#107)
- feat(web): add writing and editing a post (#106)
- feat(api): add comment threads and comment likes (#103)
- feat(web): add the post page (#102)
- test(web): wait for the sign-in request before a test ends (#104)
- feat(web): add the feed with likes and saves (#101)
- feat(api): add comment lists with reply previews (#99)
- fix(api): refuse a null character in post text instead of failing (#100)
- fix(web): open an address typed without a language (#98)
- feat(api): add comments and replies on posts (#97)
- feat(web): rebuild the not-found page and send it as html (#96)
- fix(web): tidy the loose ends left by the screen pull requests (#95)
- test(web): wait five seconds before a screen check gives up (#94)
- fix(api): cap post links and answer 404 to writes racing a delete (#93)
- fix(web): say when a hub's team is full (#92)
- feat(api): add liking and saving posts (#91)
- feat(api): add the feed and post lists (#90)
- feat(api): cap a hub at five active members (#89)
- feat(api): add posts crud endpoints (#88)
- feat(web): add the developers who match your idea (#87)
- feat(web): add the ideas that need you (#86)
- feat(web): add navigation between the signed-in screens (#85)
- feat(web): add joining a hub by signing its agreement (#83)
- feat(web): add the hub team, invitations and the private brief (#82)
- feat(web): add the profile page (#79)
- feat(web): add creating a hub, the hub page and your hubs (#78)
- feat(web): add browsing open ideas and the idea page (#77)
- feat(web): add writing, publishing and closing an idea (#76)
- feat(api): add role-based idea matching (#66)
- feat(web): add the peer review queue and case screens (#75)
- fix(web): give chips a 44px tap area (#84)
- feat(web): add the verification interview (#74)
- feat(web): add the role verification page (#73)
- test(api): accept every serial order in the hub invitation race test (#80)
- feat(web): add the village home page for signed-in developers (#72)
- feat(api): add hub invitations and membership (#68)
- fix(api): stop a 500 when a list is replaced twice at once (#71)
- feat(web): pin the landing header as a pill while scrolling (#70)
- feat(web): save the onboarding role and stack to the api (#69)
- feat(api): add the list my hubs endpoint (#67)
- feat(api): add idea lifecycle endpoints (#65)
- feat(web): add tooltips to the language and theme buttons (#63)
- fix(web): scale the hero on wide screens and add a motion toggle (#62)
- docs: let green pull requests merge without a teammate approval (#61)
- feat(api): add the get hub endpoint (#60)
- feat(web): finish github sign-in with token refresh and sign-out (#59)

## 2026-11-12

- feat(api): add the create hub endpoint (#58)
- feat(api): add the current agreement endpoint (#57)
- docs: update progress after the web review merges (#56)
- feat(web): point the hero's main button to sign-in (#39)
- fix(web): show the sign-in heading and text without a reveal (#47)
- fix(web): announce a sign-in error once and swap it in smoothly (#45)
- fix(web): keep onboarding answers when the page reloads (#54)
- fix(web): let the onboarding country list scroll with the page (#50)
- fix(web): rise the onboarding role cards only when moving forward (#44)
- fix(web): show the onboarding header on loading and error screens (#46)
- fix(web): keep onboarding chips the same width when selected (#53)
- fix(web): use the design system breakpoint on onboarding (#42)
- fix(web): give onboarding choice cards press feedback (#38)
- fix(web): keep colour fades for buttons with reduced motion (#40)
- fix(web): name onboarding technologies in french on the french page (#52)
- feat(api): add Gemini audio fallback and approval verification (#37)
- fix(web): show the chosen country while the list is filtered (#48)
- fix(web): use a narrow no-break space before french punctuation (#41)
- feat(web): add a not-found page in english and french (#55)
- feat(web): add an error page for the landing and sign-in pages (#51)
- fix(web): show the sign-in spinner in place of the github mark (#49)

## 2026-11-11

- docs: update progress after the latest api and web merges (#36)
- feat(api): add Gemini interview fallback
- feat(api): make verification interviews conversational
- feat(api): limit technical defence interviews to five turns
- feat(api): add hub models and schemas (#34)
- fix(web): keep the french phone nav links on one line (#35)
- test(api): isolate the test database from the development one (#29)
- feat(db): add hub terms and a test agreement (#33)
- feat(web): add the auth callback page that finishes github sign-in (#32)
- fix(web): give the onboarding page a title in english and french (#31)
- fix(web): show hover styles only on devices that can hover (#28)
- fix(web): keep the brand name and language code out of translation (#27)
- fix(web): say sign-in did not start when the browser cannot hash (#26)
- fix(web): use the design system breakpoint for the sign-in button (#25)
- fix(api): never block sign-in on a clashing email (#24)
- fix(web): show the real name and link the github username on the card (#23)
- feat(web): add the onboarding page for after the first sign-in (#22)
- feat(web): add the github sign-in page (#21)
- docs: add the verification routes to the architecture doc (#14)
- fix(api): return the real attempt number when a verification starts (#19)
- docs: add the api endpoints to progress and architecture (#13)
- fix(web): seat the demo note under its button in a clear space (#12)
- feat(web): add scroll reveals and feedback to the landing sections (#11)
- feat(api): add verification and peer review endpoints (#10)

## 2026-11-10

- feat(web): drift the hero background words from right to left (#9)
- feat(web): add the landing page in English and French (#8)
- feat(api): add developer roles, tech stack and feed topics (#7)

## 2026-11-07

- feat(api): add oauth authentication and user profile endpoints (#3)
- feat: add design system and use it in the web app (#6)
- ci: run api tests against postgres with pgvector (#5)
- feat(api): connected db and lookups endpoints (#2)

## 2026-11-04

- chore(repo): add agent rules, commit hook, ci and team workflow (#1)
- Set up the monorepo before pull requests were in place (pushed directly to `main`): the
  Next.js web app, the FastAPI service, the local Postgres and pgvector database, the
  README in English and French, and the contributing guide.
- Initial commit with a `.gitignore`.
