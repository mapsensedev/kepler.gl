// SPDX-License-Identifier: MIT
// Copyright contributors to the kepler.gl project

import styled from 'styled-components';
import React, {useState} from 'react';
import {RootContext} from '../';
import Tippy, {TippyProps} from '@tippyjs/react';

const TippyArrow = styled.div`
  position: absolute;
  width: 15px;
  height: 15px;
  fill: ${props => props.theme.tooltipBg};
  text-align: initial;

  > svg {
    position: absolute;
  }
`;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TippyTooltipContent = styled(({children, arrow, isLightTheme, ...props}) => (
  <div {...props}>
    {children}
    {arrow ? (
      <TippyArrow className="svg-arrow" data-popper-arrow="">
        <svg width={15} height={15}>
          <path d="M2,7.5 7.5,2 13,7.5Z" />
        </svg>
      </TippyArrow>
    ) : null}
  </div>
))`
  font-family: ${props => props.theme.fontFamily};
  font-size: ${props => props.theme.tooltipFontSize};
  font-weight: 400;
  padding: 7px 18px;
  box-shadow: ${props =>
    props.isLightTheme ? props.theme.panelBoxShadow : props.theme.tooltipBoxShadow};
  background-color: ${props =>
    props.isLightTheme ? props.theme.tooltipBgLT : props.theme.tooltipBg};
  color: ${props => (props.isLightTheme ? props.theme.tooltipColorLT : props.theme.tooltipColor)};
  border-radius: ${props => props.theme.primaryBtnRadius};
  ${props =>
    props.arrow
      ? `
    &[data-placement^='top'] > .svg-arrow {
      bottom: 0;
      &::after,
      > svg {
        top: 7px;
        transform: rotate(180deg);
      }
    }

    &[data-placement^='bottom'] > .svg-arrow {
      top: 0;
      > svg {
        bottom: 7px;
      }
    }

    &[data-placement^='left'] > .svg-arrow {
      right: 0;
      &::after,
      > svg {
        transform: rotate(90deg);
        left: 7px;
      }
    }

    &[data-placement^='right'] > .svg-arrow {
      left: 0;
      &::after,
      > svg {
        transform: rotate(-90deg);
        right: 7px;
      }
    }
  `
      : ''}
`;

const TippyTooltip = ({
  children,
  render,
  duration = 200,
  arrow = true,
  isLightTheme = false,
  className,
  ...rest
}: TippyProps & {isLightTheme?: boolean}) => {
  const [opacity, setOpacity] = useState(0);
  const [timer, setTimer] = useState(null);
  function onMount() {
    setOpacity(1);
    if (timer) {
      // @ts-ignore
      clearTimeout(timer);
    }
  }

  function onHide(instance) {
    const {unmount} = instance;
    const timeout = setTimeout(() => {
      if (!instance.state?.isDestroyed) {
        unmount();
      }
    }, duration[0] || duration);
    // @ts-ignore
    setTimer(timeout);
    setOpacity(0);
  }

  return (
    <RootContext.Consumer>
      {context => (
        <Tippy
          {...rest}
          // Using document.body would result in the CSS styles not being applied
          // to the tooltip content when embedding the map widget as a Shadow DOM element.
          appendTo={context?.current || 'parent'}
          animation={true}
          render={attrs => (
            <TippyTooltipContent
              {...attrs}
              className={className}
              style={{opacity, transition: `opacity ${duration}ms`}}
              arrow={arrow}
              isLightTheme={isLightTheme}
            >
              {render?.(attrs)}
            </TippyTooltipContent>
          )}
          onMount={onMount}
          onHide={onHide}
        >
          {children}
        </Tippy>
      )}
    </RootContext.Consumer>
  );
};

export default TippyTooltip;
