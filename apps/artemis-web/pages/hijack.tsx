import {
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  Grid,
  IconButton,
  Paper,
  Switch,
} from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';
import { Card, CardBody } from '@windmill/react-ui';
import { ContentState, EditorState } from 'draft-js';
import 'draft-js/dist/Draft.css';
import DefaultErrorPage from 'next/error';
import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useEffect } from 'react';
import { useMedia } from 'react-media';
import 'react-toastify/dist/ReactToastify.css';
import AuthHOC from '../components/401-hoc/401-hoc';
import BGPTableComponent from '../components/bgp-table/bgp-table';
import DataplaneTableComponent from '../components/dataplane-table/dataplane-table';
import HijackInfoComponent from '../components/hijack-info/hijack-info';
import LearnRuleComponent from '../components/learn-rule/learn-rule';
import Tooltip from '../components/tooltip/tooltip';
import { setup } from '../libs/csrf';
import { useGraphQl } from '../utils/hooks/use-graphql';
import { useHijack } from '../utils/hooks/use-hijack';
import { AntSwitch } from '../utils/styles';
import {
  autoLogout,
  findStatus,
  GLOBAL_MEDIA_QUERIES,
  shallMock,
  statuses,
} from '../utils/token';

const ViewHijackPage = (props) => {
  if (shallMock()) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { worker } = require('../utils/mock-sw/browser');
    worker.start();
  }

  useEffect(() => {
    autoLogout(props);
  }, [props]);

  const {
    isLive,
    setIsLive,
    tooltips,
    setTooltips,
    context,
    classes,
    distinctValues,
    setDistinctValues,
    selectState,
    setSelectState,
    hijackDataState,
    setHijackDataState,
    hijackExists,
    setHijackExists,
    filteredBgpData,
    setFilteredBgpData,
    editComment,
    setEditComment,
    editorState,
    setEditorState,
    openModalState,
    setOpenModalState,
    config,
  } = useHijack();

  const router = useRouter();

  const hijackKey: string = router.query.key.toString() ?? '';

  const user = props.user;
  const _csrf = props._csrf;

  useGraphQl('hijackByKey', {
    callback: (data) => {
      const hijacks = data.subscriptionData.data.view_hijacks;
      const hijackExists = hijacks.length !== 0;

      if (!hijackExists) {
        setHijackExists(false);
      } else {
        setHijackDataState(hijacks[0]);
        setEditorState(() =>
          EditorState.createWithContent(
            ContentState.createFromText(hijacks[0].comment)
          )
        );
      }
    },
    isLive: true,
    key: hijackKey,
    sortOrder: 'desc',
    sortColumn: 'time_last',
    hasDateFilter: false,
    hasColumnFilter: false,
    hasStatusFilter: false,
  });

  const onChangeValue = (event) => {
    setSelectState(event.target.value);

    setDistinctValues(
      filteredBgpData
        .map((entry) => {
          return entry[event.target.value];
        })
        .filter((v, i, a) => a.indexOf(v) === i)
    );
  };

  const matches = useMedia({ queries: GLOBAL_MEDIA_QUERIES });

  return (
    <>
      <Head>
        <title>ARTEMIS - Hijack</title>
      </Head>
      {user && hijackExists && (
        <div className="absolute w-full h-full">
          {/* Page title ends */}
          <div className="w-3/4 mx-auto px-6">
            <h1 className="my-6 inline-block w-full text-2xl font-semibold text-gray-700 dark:text-gray-200">
              <div className="w-1/2 float-left">Hijack<small id="hijack_status">
                {findStatus(hijackDataState).map((status, i) => (
                  <span
                    key={i}
                    style={{ marginLeft: '10px' }}
                    className={
                      'badge badge-pill badge-' + statuses[status]
                    }
                  >
                    {status}
                  </span>
                ))}
              </small></div>

              {matches.pc && (
                <div className="w-1/2 inline-block float-right">
                  <FormGroup className="float-right ml-8 relative -top-3">
                    <FormControlLabel
                      control={
                        <AntSwitch
                          onChange={() => {
                            setIsLive(!isLive);
                          }}
                          size="medium"
                          checked={isLive}
                        />
                      }
                      label=""
                    />
                  </FormGroup>
                  <h2 className="float-right dark:text-gray-50 text-gray-700">Live Update:</h2>{' '}
                </div>
              )}
            </h1>

            {/* <h2 className="mb-4 text-lg font-semibold text-gray-600 dark:text-gray-300">Ongoing, Non-Dormant Hijacks</h2> */}
            <Card className="mb-8 shadow-md">
              <CardBody>
                <HijackInfoComponent
                  {...props}
                  hijackDataState={hijackDataState}
                  isMobile={matches.mobile}
                  tooltips={tooltips}
                  setTooltips={setTooltips}
                  context={context}
                  classes={classes}
                  setOpenModalState={setOpenModalState}
                  hijackKey={hijackKey}
                  editorState={editorState}
                  setEditorState={setEditorState}
                />
              </CardBody>
            </Card>

            <div className="w-full pr-8 float-left">
              <h2 className="mb-4 text-lg font-semibold text-gray-600 dark:text-gray-300">Related BGP Updates</h2>
              <Card>
                <CardBody className="card-header">
                  <Dialog
                    aria-labelledby="customized-dialog-title"
                    open={openModalState}
                  >
                    <DialogTitle id="customized-dialog-title">
                      Configuration diff (Learn new rule)
                      <IconButton
                        style={{ float: 'right' }}
                        aria-label="close"
                        onClick={() => setOpenModalState(false)}
                      >
                        <CloseIcon />
                      </IconButton>
                    </DialogTitle>
                    <DialogContent dividers>
                      <div id="modal_display_config_comparison">
                        <LearnRuleComponent
                          {...props}
                          hijack={hijackDataState}
                          config={config}
                        />
                      </div>
                    </DialogContent>
                  </Dialog>
                  <BGPTableComponent
                    filter={0}
                    _csrf={_csrf}
                    isLive={isLive}
                    setFilteredBgpData={setFilteredBgpData}
                    hijackKey={hijackKey}
                    skippedCols={['as_path', 'hijack_key']}
                  />
                </CardBody>
              </Card>

              <h2 className="mb-4 mt-4 text-lg font-semibold text-gray-600 dark:text-gray-300">Additional actions</h2>
              <Card className="mb-3 shadow-md">
                <CardBody>
                  <select
                    className="form-control"
                    id="distinct_values_selection"
                    value={selectState}
                    onChange={onChangeValue.bind(this)}
                  >
                    <option value="select">Select</option>
                    <option value="origin_as">Origin AS</option>
                    <option value="peer_asn">Peer AS</option>
                    <option value="service">Service</option>
                  </select>
                </CardBody>
              </Card>
              <Card>
                <CardBody className="card-header">
                  <Grid>
                    {filteredBgpData &&
                      distinctValues.map((value, i) => {
                        if (value !== undefined) {
                          const asn = value;
                          if (
                            selectState === 'origin_as' ||
                            selectState === 'peer_asn'
                          )
                            value = (
                              <div key={1 + '_' + i}>
                                <Tooltip
                                  tooltips={tooltips}
                                  setTooltips={setTooltips}
                                  asn={asn}
                                  label={`originD${i}`}
                                  context={context}
                                />
                              </div>
                            );
                          return (
                            <Grid key={0 + '_' + i} item xs>
                              <Paper
                                key={2 + '_' + i}
                                className={classes.paper}
                              >
                                {value}
                              </Paper>
                            </Grid>
                          );
                        } else return <> </>;
                      })}
                  </Grid>
                </CardBody>
              </Card>
            </div>
          </div >
        </div >
      )
      }
      {
        user && !hijackExists && (
          <DefaultErrorPage
            statusCode={404}
            title={'This hijack does not exist'}
          />
        )
      }
    </>
  );
};

export default AuthHOC(ViewHijackPage, ['admin', 'user']);

export const getServerSideProps = setup(async (req, res, csrftoken) => {
  return { props: { _csrf: csrftoken, _inactivity_timeout: process.env.INACTIVITY_TIMEOUT, system_version: process.env.SYSTEM_VERSION } };
});
