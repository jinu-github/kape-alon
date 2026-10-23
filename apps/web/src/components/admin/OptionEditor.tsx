import type { OptionGroup } from '@kape/shared';
export function OptionEditor({
  groups,
  onChange,
}: {
  groups: OptionGroup[];
  onChange: (value: OptionGroup[]) => void;
}) {
  const update = (index: number, value: OptionGroup) =>
    onChange(groups.map((group, i) => (i === index ? value : group)));
  return (
    <fieldset className="option-editor">
      <legend>Option groups and choices</legend>
      {groups.map((group, index) => (
        <fieldset key={group.id}>
          <legend>Group {index + 1}</legend>
          <label>
            Group name
            <input
              required
              maxLength={80}
              value={group.name}
              onChange={(e) =>
                update(index, { ...group, name: e.target.value })
              }
            />
          </label>
          <div className="form-pair">
            <label>
              Minimum choices
              <input
                type="number"
                min={0}
                max={10}
                required
                value={group.minSelections}
                onChange={(e) =>
                  update(index, {
                    ...group,
                    minSelections: e.target.valueAsNumber,
                  })
                }
              />
            </label>
            <label>
              Maximum choices
              <input
                type="number"
                min={1}
                max={10}
                required
                value={group.maxSelections}
                onChange={(e) =>
                  update(index, {
                    ...group,
                    maxSelections: e.target.valueAsNumber,
                  })
                }
              />
            </label>
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={group.available}
              onChange={(e) =>
                update(index, { ...group, available: e.target.checked })
              }
            />
            Group available
          </label>
          {group.choices.map((choice, choiceIndex) => (
            <fieldset key={choice.id}>
              <legend>Choice {choiceIndex + 1}</legend>
              <label>
                Choice name
                <input
                  required
                  maxLength={80}
                  value={choice.name}
                  onChange={(e) =>
                    update(index, {
                      ...group,
                      choices: group.choices.map((value, i) =>
                        i === choiceIndex
                          ? { ...value, name: e.target.value }
                          : value,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Additional price in cents
                <input
                  required
                  type="number"
                  min={0}
                  max={10000000}
                  step={1}
                  value={choice.priceCents}
                  onChange={(e) =>
                    update(index, {
                      ...group,
                      choices: group.choices.map((value, i) =>
                        i === choiceIndex
                          ? { ...value, priceCents: e.target.valueAsNumber }
                          : value,
                      ),
                    })
                  }
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={choice.available}
                  onChange={(e) =>
                    update(index, {
                      ...group,
                      choices: group.choices.map((value, i) =>
                        i === choiceIndex
                          ? { ...value, available: e.target.checked }
                          : value,
                      ),
                    })
                  }
                />
                Choice available
              </label>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  update(index, {
                    ...group,
                    choices: group.choices.filter((_, i) => i !== choiceIndex),
                  })
                }
              >
                Remove choice {choiceIndex + 1}
              </button>
            </fieldset>
          ))}
          <div className="admin-actions">
            <button
              type="button"
              disabled={group.choices.length >= 20}
              onClick={() =>
                update(index, {
                  ...group,
                  choices: [
                    ...group.choices,
                    {
                      id: crypto.randomUUID(),
                      name: '',
                      priceCents: 0,
                      available: true,
                    },
                  ],
                })
              }
            >
              Add choice
            </button>
            <button
              type="button"
              onClick={() => onChange(groups.filter((_, i) => i !== index))}
            >
              Remove group {index + 1}
            </button>
          </div>
        </fieldset>
      ))}
      <button
        type="button"
        className="text-button"
        disabled={groups.length >= 10}
        onClick={() =>
          onChange([
            ...groups,
            {
              id: crypto.randomUUID(),
              name: '',
              minSelections: 0,
              maxSelections: 1,
              available: true,
              choices: [
                {
                  id: crypto.randomUUID(),
                  name: '',
                  priceCents: 0,
                  available: true,
                },
              ],
            },
          ])
        }
      >
        Add option group
      </button>
    </fieldset>
  );
}
