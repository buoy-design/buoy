// CSF3 (Component Story Format 3) - Modern Storybook format
export const CSF3_BUTTON_STORY = `
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'outline'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    disabled: { control: 'boolean' },
  },
  args: {
    children: 'Button',
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    variant: 'primary',
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
  },
};
`;

// CSF2 (Component Story Format 2) - Legacy Storybook format
export const CSF2_CARD_STORY = `
import React from 'react';
import type { ComponentStoryFn, Meta } from '@storybook/react';
import { Card } from './Card';

export default {
  title: 'UI/Card',
  component: Card,
  argTypes: {
    elevation: { control: { type: 'range', min: 0, max: 5 } },
  },
} as Meta;

const Template: ComponentStoryFn<typeof Card> = (args) => <Card {...args} />;

export const Default = Template.bind({});
Default.args = {
  title: 'Card Title',
  content: 'Card content goes here',
};

export const Elevated = Template.bind({});
Elevated.args = {
  ...Default.args,
  elevation: 3,
};
`;

// Story with play function (interaction tests)
export const STORY_WITH_PLAY = `
import type { Meta, StoryObj } from '@storybook/react';
import { within, userEvent, expect } from '@storybook/test';
import { LoginForm } from './LoginForm';

const meta: Meta<typeof LoginForm> = {
  title: 'Forms/LoginForm',
  component: LoginForm,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof LoginForm>;

export const FilledForm: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.type(canvas.getByLabelText('Email'), 'test@example.com');
    await userEvent.type(canvas.getByLabelText('Password'), 'password123');
    await userEvent.click(canvas.getByRole('button', { name: 'Submit' }));

    await expect(canvas.getByText('Welcome!')).toBeInTheDocument();
  },
};
`;

// Story with decorators
export const STORY_WITH_DECORATORS = `
import type { Meta, StoryObj } from '@storybook/react';
import { ThemeProvider } from '../theme';
import { Modal } from './Modal';

const meta: Meta<typeof Modal> = {
  title: 'Overlays/Modal',
  component: Modal,
  decorators: [
    (Story) => (
      <ThemeProvider theme="dark">
        <Story />
      </ThemeProvider>
    ),
  ],
  parameters: {
    backgrounds: { default: 'dark' },
  },
};

export default meta;
type Story = StoryObj<typeof Modal>;

export const Default: Story = {
  args: {
    isOpen: true,
    title: 'Modal Title',
    children: 'Modal content',
  },
};
`;

// Story with nested title (hierarchy)
export const NESTED_TITLE_STORY = `
import type { Meta, StoryObj } from '@storybook/react';
import { Tooltip } from './Tooltip';

const meta: Meta<typeof Tooltip> = {
  title: 'Design System/Primitives/Tooltip',
  component: Tooltip,
};

export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  args: {
    content: 'Tooltip text',
    children: 'Hover me',
  },
};

export const WithArrow: Story = {
  args: {
    content: 'Tooltip with arrow',
    children: 'Hover me',
    hasArrow: true,
  },
};
`;

// JavaScript story file (no types)
export const JS_STORY_FILE = `
import { Button } from './Button';

export default {
  title: 'Legacy/Button',
  component: Button,
  argTypes: {
    onClick: { action: 'clicked' },
  },
};

export const Primary = {
  args: {
    primary: true,
    label: 'Button',
  },
};

export const Secondary = {
  args: {
    label: 'Button',
  },
};
`;

// Story with render function
export const STORY_WITH_RENDER = `
import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Counter } from './Counter';

const meta: Meta<typeof Counter> = {
  title: 'Interactive/Counter',
  component: Counter,
};

export default meta;
type Story = StoryObj<typeof Counter>;

export const Controlled: Story = {
  render: function Render(args) {
    const [count, setCount] = useState(0);
    return (
      <Counter
        {...args}
        count={count}
        onIncrement={() => setCount(c => c + 1)}
        onDecrement={() => setCount(c => c - 1)}
      />
    );
  },
};
`;

// MDX story format
export const MDX_STORY = `
import { Meta, Story, Canvas } from '@storybook/addon-docs';
import { Alert } from './Alert';

<Meta title="Feedback/Alert" component={Alert} />

# Alert

Alerts display brief messages for the user.

<Canvas>
  <Story name="Success">
    <Alert type="success">Operation completed successfully!</Alert>
  </Story>
</Canvas>

<Canvas>
  <Story name="Error">
    <Alert type="error">Something went wrong.</Alert>
  </Story>
</Canvas>
`;

// Story with tags
export const STORY_WITH_TAGS = `
import type { Meta, StoryObj } from '@storybook/react';
import { ExperimentalFeature } from './ExperimentalFeature';

const meta: Meta<typeof ExperimentalFeature> = {
  title: 'Experimental/Feature',
  component: ExperimentalFeature,
  tags: ['experimental', 'beta', 'autodocs'],
};

export default meta;
type Story = StoryObj<typeof ExperimentalFeature>;

export const Default: Story = {
  tags: ['!autodocs'],  // Exclude from autodocs
  args: {
    enabled: true,
  },
};
`;

// Storybook main.ts config
export const STORYBOOK_MAIN_CONFIG = `
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: [
    '../src/**/*.mdx',
    '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
  ],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
};

export default config;
`;

// Storybook index.json (built output)
export const STORYBOOK_INDEX_JSON = `{
  "v": 5,
  "entries": {
    "components-button--primary": {
      "id": "components-button--primary",
      "title": "Components/Button",
      "name": "Primary",
      "importPath": "./src/components/Button.stories.tsx",
      "type": "story",
      "tags": ["autodocs", "story"]
    },
    "components-button--secondary": {
      "id": "components-button--secondary",
      "title": "Components/Button",
      "name": "Secondary",
      "importPath": "./src/components/Button.stories.tsx",
      "type": "story",
      "tags": ["autodocs", "story"]
    },
    "components-button--docs": {
      "id": "components-button--docs",
      "title": "Components/Button",
      "name": "Docs",
      "importPath": "./src/components/Button.stories.tsx",
      "type": "docs",
      "tags": ["autodocs", "docs"]
    },
    "ui-card--default": {
      "id": "ui-card--default",
      "title": "UI/Card",
      "name": "Default",
      "importPath": "./src/components/Card.stories.tsx",
      "type": "story",
      "tags": ["story"]
    }
  }
}`;

// Legacy stories.json format
export const STORYBOOK_STORIES_JSON = `{
  "v": 3,
  "stories": {
    "button--primary": {
      "id": "button--primary",
      "title": "Button",
      "name": "Primary",
      "importPath": "./src/Button.stories.tsx",
      "kind": "Button",
      "story": "Primary"
    },
    "button--secondary": {
      "id": "button--secondary",
      "title": "Button",
      "name": "Secondary",
      "importPath": "./src/Button.stories.tsx",
      "kind": "Button",
      "story": "Secondary"
    }
  }
}`;

// CSF3 Auto-title story (no title property, uses file path)
export const CSF3_AUTO_TITLE_STORY = `
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

// No title property - Storybook infers from file path
const meta = {
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary'],
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    variant: 'primary',
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
  },
};
`;

// Story with subcomponents
export const STORY_WITH_SUBCOMPONENTS = `
import type { Meta, StoryObj } from '@storybook/react';
import { List } from './List';
import { ListItem } from './ListItem';
import { ListHeader } from './ListHeader';

const meta: Meta<typeof List> = {
  title: 'Components/List',
  component: List,
  subcomponents: { ListItem, ListHeader },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof List>;

export const Default: Story = {
  args: {
    children: [
      <ListHeader key="h">Header</ListHeader>,
      <ListItem key="1">Item 1</ListItem>,
      <ListItem key="2">Item 2</ListItem>,
    ],
  },
};
`;

// Story with docs parameters (description)
export const STORY_WITH_DOCS_PARAMS = `
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  parameters: {
    docs: {
      description: {
        component: 'A versatile button component for user interactions.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: { variant: 'primary', label: 'Click me' },
  parameters: {
    docs: {
      description: {
        story: 'The primary variant is used for main actions.',
      },
    },
  },
};

export const Secondary: Story = {
  args: { variant: 'secondary', label: 'Click me' },
};
`;

// Story using loaders (async data fetching)
export const STORY_WITH_LOADERS = `
import type { Meta, StoryObj } from '@storybook/react';
import { UserProfile } from './UserProfile';

const meta: Meta<typeof UserProfile> = {
  title: 'Data/UserProfile',
  component: UserProfile,
  loaders: [
    async () => ({
      user: await fetch('/api/user/1').then(r => r.json()),
    }),
  ],
};

export default meta;
type Story = StoryObj<typeof UserProfile>;

export const Default: Story = {
  render: (args, { loaded: { user } }) => <UserProfile {...args} user={user} />,
};
`;

// Story with beforeEach
export const STORY_WITH_BEFORE_EACH = `
import type { Meta, StoryObj } from '@storybook/react';
import { userEvent, within } from '@storybook/test';
import { Form } from './Form';

const meta: Meta<typeof Form> = {
  title: 'Forms/Form',
  component: Form,
  beforeEach: async () => {
    // Reset form state before each story
    localStorage.clear();
  },
};

export default meta;
type Story = StoryObj<typeof Form>;

export const Empty: Story = {};

export const Prefilled: Story = {
  beforeEach: async () => {
    localStorage.setItem('formData', JSON.stringify({ name: 'Test' }));
  },
  args: {
    loadFromStorage: true,
  },
};
`;

// Storybook index.json v5 format with more metadata
export const STORYBOOK_INDEX_JSON_V5 = `{
  "v": 5,
  "entries": {
    "components-button--primary": {
      "id": "components-button--primary",
      "title": "Components/Button",
      "name": "Primary",
      "importPath": "./src/components/Button.stories.tsx",
      "type": "story",
      "tags": ["autodocs", "story"],
      "componentPath": "./src/components/Button.tsx"
    },
    "components-button--secondary": {
      "id": "components-button--secondary",
      "title": "Components/Button",
      "name": "Secondary",
      "importPath": "./src/components/Button.stories.tsx",
      "type": "story",
      "tags": ["autodocs", "story"],
      "componentPath": "./src/components/Button.tsx"
    },
    "components-list--default": {
      "id": "components-list--default",
      "title": "Components/List",
      "name": "Default",
      "importPath": "./src/components/List.stories.tsx",
      "type": "story",
      "tags": ["autodocs", "story"],
      "componentPath": "./src/components/List.tsx"
    }
  }
}`;
