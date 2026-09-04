'use client';

import { createContext, ReactNode, useContext, useState } from 'react';
import { CaptionAnimation, CaptionStyle, HeadlineFont, HeadlinePosition, HeadlineStyle } from '../../lib/api';

export type Platform = 'tiktok' | 'instagram' | 'shorts' | 'youtube';
export type LayoutMode = 'reaction_top' | 'main_top' | 'picture_in_picture' | 'blur_center';
export type CaptionSettings = { enabled:boolean; style:CaptionStyle; uppercase:boolean; words:number; animation:CaptionAnimation; x:number; y:number; size:number };

type EditorDesign = {
  platform: Platform; setPlatform:(value:Platform)=>void;
  layout: LayoutMode; setLayout:(value:LayoutMode)=>void;
  captions: CaptionSettings; setCaptions:(value:CaptionSettings | ((current:CaptionSettings)=>CaptionSettings))=>void;
  headline:string; setHeadline:(value:string)=>void;
  secondaryHeadline:string; setSecondaryHeadline:(value:string)=>void;
  headlineEnabled:boolean; setHeadlineEnabled:(value:boolean)=>void; secondaryHeadlineEnabled:boolean; setSecondaryHeadlineEnabled:(value:boolean)=>void;
  ownerSafeLayout:boolean; setOwnerSafeLayout:(value:boolean)=>void;
  headlineStyle:HeadlineStyle; setHeadlineStyle:(value:HeadlineStyle)=>void;
  headlinePosition:HeadlinePosition; setHeadlinePosition:(value:HeadlinePosition)=>void;
  headlineSize:number; setHeadlineSize:(value:number)=>void;
  headlineFont:HeadlineFont; setHeadlineFont:(value:HeadlineFont)=>void;
  headlineTextColor:string; setHeadlineTextColor:(value:string)=>void;
  headlineBackgroundColor:string; setHeadlineBackgroundColor:(value:string)=>void;
  headlineX:number; setHeadlineX:(value:number)=>void; headlineY:number; setHeadlineY:(value:number)=>void;
  secondaryHeadlineX:number; setSecondaryHeadlineX:(value:number)=>void; secondaryHeadlineY:number; setSecondaryHeadlineY:(value:number)=>void;
  blurStrength:number; setBlurStrength:(value:number)=>void; backgroundDim:number; setBackgroundDim:(value:number)=>void;
  mainX:number; setMainX:(value:number)=>void; mainY:number; setMainY:(value:number)=>void; mainScale:number; setMainScale:(value:number)=>void;
  reactionX:number; setReactionX:(value:number)=>void; reactionY:number; setReactionY:(value:number)=>void; reactionScale:number; setReactionScale:(value:number)=>void;
  frameX:number; setFrameX:(value:number)=>void; frameY:number; setFrameY:(value:number)=>void; frameScale:number; setFrameScale:(value:number)=>void;
};

const Context = createContext<EditorDesign | null>(null);

export function EditorDesignProvider({children}:{children:ReactNode}) {
  const [platform,setPlatform]=useState<Platform>('shorts'); const [layout,setLayout]=useState<LayoutMode>('reaction_top');
  const [captions,setCaptions]=useState<CaptionSettings>({enabled:true,style:'bold',uppercase:false,words:4,animation:'pop',x:50,y:68,size:88});
  const [headline,setHeadline]=useState(''); const [secondaryHeadline,setSecondaryHeadline]=useState('');
  const [headlineEnabled,setHeadlineEnabled]=useState(true); const [secondaryHeadlineEnabled,setSecondaryHeadlineEnabled]=useState(true);
  const [ownerSafeLayout,setOwnerSafeLayout]=useState(false);
  const [headlineStyle,setHeadlineStyle]=useState<HeadlineStyle>('clean'); const [headlinePosition,setHeadlinePosition]=useState<HeadlinePosition>('split');
  const [headlineSize,setHeadlineSize]=useState(64); const [headlineFont,setHeadlineFont]=useState<HeadlineFont>('Montserrat');
  const [headlineTextColor,setHeadlineTextColor]=useState('#EF1F1F'); const [headlineBackgroundColor,setHeadlineBackgroundColor]=useState('#FFFFFF');
  const [headlineX,setHeadlineX]=useState(50); const [headlineY,setHeadlineY]=useState(44); const [secondaryHeadlineX,setSecondaryHeadlineX]=useState(50); const [secondaryHeadlineY,setSecondaryHeadlineY]=useState(18);
  const [blurStrength,setBlurStrength]=useState(32); const [backgroundDim,setBackgroundDim]=useState(10);
  const [mainX,setMainX]=useState(50);const [mainY,setMainY]=useState(72);const [mainScale,setMainScale]=useState(1);
  const [reactionX,setReactionX]=useState(50);const [reactionY,setReactionY]=useState(22);const [reactionScale,setReactionScale]=useState(1);
  const [frameX,setFrameX]=useState(50);const [frameY,setFrameY]=useState(22);const [frameScale,setFrameScale]=useState(1);
  return <Context.Provider value={{platform,setPlatform,layout,setLayout,captions,setCaptions,headline,setHeadline,secondaryHeadline,setSecondaryHeadline,headlineEnabled,setHeadlineEnabled,secondaryHeadlineEnabled,setSecondaryHeadlineEnabled,ownerSafeLayout,setOwnerSafeLayout,headlineStyle,setHeadlineStyle,headlinePosition,setHeadlinePosition,headlineSize,setHeadlineSize,headlineFont,setHeadlineFont,headlineTextColor,setHeadlineTextColor,headlineBackgroundColor,setHeadlineBackgroundColor,headlineX,setHeadlineX,headlineY,setHeadlineY,secondaryHeadlineX,setSecondaryHeadlineX,secondaryHeadlineY,setSecondaryHeadlineY,blurStrength,setBlurStrength,backgroundDim,setBackgroundDim,mainX,setMainX,mainY,setMainY,mainScale,setMainScale,reactionX,setReactionX,reactionY,setReactionY,reactionScale,setReactionScale,frameX,setFrameX,frameY,setFrameY,frameScale,setFrameScale}}>{children}</Context.Provider>;
}

export function useEditorDesign(){const value=useContext(Context);if(!value)throw new Error('EditorDesignProvider fehlt');return value;}
