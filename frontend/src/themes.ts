/** UI chrome only: geometry, reference and selection colors retain their meaning. */
export const DARK_UI_PALETTE_ID = "dark-ui-palette";
export const darkThemes = [
  {id:"midnight",name:"Midnight",description:"Deep navy with ice-blue accents",base:"#101721",panel:"#151f2c",raised:"#1c2b3c",input:"#0d1520",line:"#304258",text:"#dce7f3",muted:"#99aec4",accent:"#99c8ef",selection:"#263d55",viewport:"#141d29"},
  {id:"graphite",name:"Graphite",description:"Warm charcoal with muted copper",base:"#191817",panel:"#211f1d",raised:"#2c2824",input:"#151412",line:"#494039",text:"#eee6dc",muted:"#b5a99b",accent:"#dbb38e",selection:"#40342b",viewport:"#1e1c1a"},
  {id:"tide",name:"Tide",description:"Deep teal with sea-glass accents",base:"#101b1d",panel:"#152427",raised:"#1c3034",input:"#0c1719",line:"#304c50",text:"#d9eeec",muted:"#99b6b7",accent:"#91d5c8",selection:"#254447",viewport:"#142225"},
  {id:"aubergine",name:"Aubergine",description:"Smoky plum with soft lavender",base:"#1a161f",panel:"#221d2b",raised:"#30273b",input:"#15111b",line:"#483b55",text:"#eae1f2",muted:"#b3a3c3",accent:"#c5ace3",selection:"#40314e",viewport:"#211b29"},
  {id:"forest",name:"Forest",description:"Dark olive with sage accents",base:"#171c17",panel:"#1e261f",raised:"#29332a",input:"#121813",line:"#3e5040",text:"#e1eadc",muted:"#a4b59f",accent:"#b5cea0",selection:"#344635",viewport:"#1b231c"},
  {id:"monochrome-light",name:"Monochrome Light",description:"Lighter charcoal with silver accents",base:"#292929",panel:"#333333",raised:"#3e3e3e",input:"#242424",line:"#606060",text:"#ededed",muted:"#bcbcbc",accent:"#d0d0d0",selection:"#4b4b4b",viewport:"#303030"},
  {id:"monochrome-dark",name:"Monochrome Dark",description:"Near-black with soft gray accents",base:"#0d0d0d",panel:"#151515",raised:"#202020",input:"#090909",line:"#383838",text:"#dddddd",muted:"#a0a0a0",accent:"#b8b8b8",selection:"#303030",viewport:"#111111"},
] as const;
export type DarkThemeId = typeof darkThemes[number]["id"];
export type DarkPalette = {enabled:boolean;theme:DarkThemeId};
export const defaultDarkPalette = ():DarkPalette => ({enabled:false,theme:"midnight"});
export function resolveDarkTheme(setting:DarkPalette){return setting.enabled?darkThemes.find(t=>t.id===setting.theme):undefined;}
export function applyDarkTheme(root:HTMLElement,setting:DarkPalette){
  const theme=resolveDarkTheme(setting);
  const keys=["base","panel","raised","input","line","text","muted","accent","selection","viewport"] as const;
  if(theme){root.dataset.uiTheme=theme.id;for(const key of keys)root.style.setProperty(`--theme-${key}`,theme[key]);}
  else {delete root.dataset.uiTheme;for(const key of keys)root.style.removeProperty(`--theme-${key}`);}
}
